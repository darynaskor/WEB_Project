import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import AuthPanel from '../AuthPanel.jsx';
import AppLayout from './AppLayout.jsx';
import { fetchTasks, createTask, updateTask, cancelTask } from '../../api/tasks.js';
import { login as loginRequest, register as registerRequest } from '../../api/auth.js';
import {
  DEFAULT_OPTIONS,
  MAX_TASK_COMPLEXITY,
} from '../../config/filters.js';
import {
  buildFilterString,
  calculateTaskComplexity,
  deepCopyOptions,
} from '../../utils/filters.js';
import { generateProcessedImageURL, revokeImageURL } from '../../utils/images.js';
import { getProcessingStage } from '../../utils/processing.js';

function AppContainer() {
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [options, setOptions] = useState(deepCopyOptions(DEFAULT_OPTIONS));
  const initialOptionsRef = useRef(deepCopyOptions(DEFAULT_OPTIONS));

  const [imageURL, setImageURL] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const fileInputRef = useRef(null);

  const [processingStatus, setProcessingStatus] = useState('idle'); 
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingError, setProcessingError] = useState('');
  const [processedImageURL, setProcessedImageURL] = useState(null);
  const processingTimerRef = useRef(null);

  const [authToken, setAuthToken] = useState(() => {
    if (typeof window === 'undefined') return '';
    const stored = window.localStorage.getItem('image-manager-token');
    return stored || '';
  });
  const [currentUser, setCurrentUser] = useState(() => {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem('image-manager-user');
    return stored ? JSON.parse(stored) : null;
  });
  const [authLoading, setAuthLoading] = useState(false);
  const isAuthenticated = Boolean(authToken && currentUser);

  const [tasks, setTasks] = useState([]);
  const [tasksError, setTasksError] = useState('');
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const activeTaskIdRef = useRef(null);

  const clearActiveTask = useCallback(() => {
    setActiveTaskId(null);
    activeTaskIdRef.current = null;
  }, []);

  const clearProcessingTimer = useCallback(() => {
    if (processingTimerRef.current) {
      clearInterval(processingTimerRef.current);
      processingTimerRef.current = null;
    }
  }, []);

  const storeProcessedImageURL = useCallback((url) => {
    setProcessedImageURL((prev) => {
      if (prev && typeof prev === 'string' && prev.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      return url;
    });
  }, []);

  const cleanupProcessedResult = useCallback(() => {
    storeProcessedImageURL(null);
  }, [storeProcessedImageURL]);

  const refreshTasks = useCallback(async () => {
    if (!authToken) {
      setTasks([]);
      setTasksError('');
      clearActiveTask();
      return;
    }
    setIsLoadingTasks(true);
    try {
      const list = await fetchTasks(authToken);
      setTasks(list);
      setTasksError('');
    } catch (error) {
      const message = error?.message ?? 'Не вдалося завантажити історію задач.';
      setTasksError(message);
    } finally {
      setIsLoadingTasks(false);
    }
  }, [authToken, clearActiveTask]);

  const patchActiveTask = useCallback(
    async (payload, options = {}) => {
      const taskId = activeTaskIdRef.current;
      if (!taskId || !authToken) return;
      const shouldRefresh = options.refresh ?? false;
      try {
        await updateTask(taskId, payload, authToken);
        if (shouldRefresh) {
          refreshTasks();
        }
      } catch (error) {
        console.error('Не вдалося оновити задачу:', error);
      }
    },
    [authToken, refreshTasks]
  );

  const cancelActiveTaskOnServer = useCallback(
    async (options = {}) => {
      const taskId = activeTaskIdRef.current;
      if (!taskId || !authToken) return;
      const shouldRefresh = options.refresh ?? false;
      try {
        await cancelTask(taskId, authToken);
      } catch (error) {
        console.error('Не вдалося скасувати задачу:', error);
      } finally {
        clearActiveTask();
        if (shouldRefresh) {
          refreshTasks();
        }
      }
    },
    [authToken, clearActiveTask, refreshTasks]
  );

  const persistAuth = useCallback((token, user) => {
    setAuthToken(token);
    setCurrentUser(user);

    if (typeof window !== 'undefined') {
      if (token) {
        window.localStorage.setItem('image-manager-token', token);
      } else {
        window.localStorage.removeItem('image-manager-token');
      }
      if (user) {
        window.localStorage.setItem('image-manager-user', JSON.stringify(user));
      } else {
        window.localStorage.removeItem('image-manager-user');
      }
    }
  }, []);

  const handleAuth = useCallback(
    async ({ mode, email, password }) => {
      setAuthLoading(true);
      try {
        const action = mode === 'register' ? registerRequest : loginRequest;
        const { token, user } = await action(email, password);
        persistAuth(token, user);
        clearActiveTask();
        await refreshTasks();
      } finally {
        setAuthLoading(false);
      }
    },
    [clearActiveTask, persistAuth, refreshTasks]
  );

  const resetProcessing = useCallback(
    ({ status = 'idle', message = '', error = '', progress = 0, cancelTask = false } = {}) => {
      if (cancelTask) {
        cancelActiveTaskOnServer();
      }
      cleanupProcessedResult();
      clearProcessingTimer();
      setProcessingStatus(status);
      setProcessingProgress(progress);
      setProcessingMessage(message);
      setProcessingError(error);
    },
    [cancelActiveTaskOnServer, cleanupProcessedResult, clearProcessingTimer]
  );

  function runProcessingInterval({ complexity }) {
    const estimatedDuration = Math.max(4000, complexity * 35); 
    const step = 5;
    const intervalDelay = Math.max(200, Math.floor(estimatedDuration / (100 / step)));

    clearProcessingTimer();

    processingTimerRef.current = setInterval(() => {
      setProcessingProgress((prev) => {
        const next = Math.min(prev + step, 100);

        if (next >= 100) {
          clearProcessingTimer();

          const baseImage = imageURL;
          if (!baseImage) {
            setProcessingStatus('error');
            setProcessingMessage('');
            setProcessingError('Зображення було видалено до завершення обробки.');
            patchActiveTask({
              status: 'failed',
              progress: next,
              errorMessage: 'Зображення видалено до завершення.',
            });
            clearActiveTask();
            return next;
          }

          const snapshotOptions = deepCopyOptions(options);

          setProcessingStatus('completed');
          setProcessingMessage('Формуємо файл для завантаження...');

          generateProcessedImageURL(baseImage, snapshotOptions)
            .then((url) => {
              if (!url) {
                throw new Error('empty-url');
              }
              storeProcessedImageURL(url);
              setProcessingMessage('Обробка завершена, файл готовий до завантаження.');
              setProcessingError('');
              patchActiveTask({
                status: 'completed',
                progress: 100,
                resultSummary: 'Файл готовий до завантаження.',
              });
              clearActiveTask();
            })
            .catch(() => {
              storeProcessedImageURL(null);
              setProcessingStatus('error');
              setProcessingError('Не вдалося підготувати файл для завантаження. Спробуйте ще раз.');
              setProcessingMessage('');
              patchActiveTask({
                status: 'failed',
                progress: next,
                errorMessage: 'Не вдалося сформувати файл.',
              });
              clearActiveTask();
            });
        } else {
          setProcessingMessage(getProcessingStage(next));
          patchActiveTask({ progress: next, status: 'running' }, { refresh: false });
        }

        return next;
      });
    }, intervalDelay);
  }

  const handleLogout = useCallback(async () => {
    setAuthLoading(true);
    try {
      await cancelActiveTaskOnServer({ refresh: false });
    } finally {
      setAuthLoading(false);
    }
    resetProcessing({ status: 'idle' });
    setTasks([]);
    setTasksError('');
    setUploadedFileName('');
    persistAuth('', null);
  }, [cancelActiveTaskOnServer, persistAuth, resetProcessing]);

  const selectedOption = options[selectedOptionIndex];
  const currentComplexity = calculateTaskComplexity(options, initialOptionsRef.current);

  function handleSliderChange({ target }) {
    const newVal = Number(target.value);
    const currentVal = options[selectedOptionIndex].value;
    if (newVal === currentVal) return;

    if (processingStatus !== 'idle') {
      resetProcessing({ status: 'idle', cancelTask: true });
    }

    const updatedOptions = options.map((option, index) =>
      index === selectedOptionIndex ? { ...option, value: newVal } : option
    );
    setOptions(updatedOptions);
  }

  function getImageStyle() {
    const filters = buildFilterString(options);
    return { filter: filters };
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSizeMB = 5;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      alert(`Файл занадто великий! Максимальний розмір — ${maxSizeMB} MB.`);
      e.target.value = '';
      return;
    }

    await cancelActiveTaskOnServer();
    resetProcessing({ status: 'idle' });

    revokeImageURL(imageURL);

    const objectUrl = URL.createObjectURL(file);
    setImageURL(objectUrl);
    setUploadedFileName(file.name || '');

    e.target.value = '';
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function clearImage() {
    if (imageURL) {
      revokeImageURL(imageURL);
      setImageURL(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    setUploadedFileName('');
    await cancelActiveTaskOnServer();
    resetProcessing({ status: 'idle' });
  }

  async function startProcessingTask() {
    if (processingStatus === 'running') return;

    if (!isAuthenticated || !authToken) {
      setProcessingStatus('error');
      setProcessingProgress(0);
      setProcessingMessage('');
      setProcessingError('Увійдіть до системи, щоб запустити обробку.');
      return;
    }

    if (!imageURL) {
      clearProcessingTimer();
      setProcessingStatus('error');
      setProcessingProgress(0);
      setProcessingMessage('');
      setProcessingError('Спочатку завантажте зображення для обробки.');
      return;
    }

    const complexity = calculateTaskComplexity(options, initialOptionsRef.current);
    if (complexity > MAX_TASK_COMPLEXITY) {
      clearProcessingTimer();
      setProcessingStatus('error');
      setProcessingProgress(0);
      setProcessingMessage('');
      setProcessingError(
        `Складність задачі (${complexity}) перевищує максимально допустиме значення ${MAX_TASK_COMPLEXITY}. Зменште інтенсивність фільтрів та спробуйте знову.`
      );
      return;
    }

    cleanupProcessedResult();
    clearProcessingTimer();
    setProcessingError('');
    setProcessingProgress(0);

    try {
      const snapshot = deepCopyOptions(options).map((option) => ({
        name: option.name,
        property: option.property,
        value: Number(option.value),
        range: { ...option.range },
        unit: option.unit,
      }));
      const createResponse = await createTask(
        {
          filters: snapshot,
          complexity,
          imageName: uploadedFileName || null,
        },
        authToken
      );

      const createdTask = createResponse.task;
      setActiveTaskId(createdTask.id);
      activeTaskIdRef.current = createdTask.id;
      refreshTasks();
    } catch (error) {
      setProcessingStatus('error');
      setProcessingProgress(0);
      setProcessingMessage('');
      setProcessingError(error?.message ?? 'Не вдалося створити задачу.');
      refreshTasks();
      return;
    }

    setProcessingStatus('running');
    setProcessingMessage('Підготовка зображення...');
    setProcessingProgress(0);
    runProcessingInterval({ complexity });
  }

  async function cancelProcessingTask() {
    if (processingStatus !== 'running') return;
    resetProcessing({ status: 'cancelled', message: 'Обробку скасовано.', cancelTask: true });
    await refreshTasks();
  }

  function downloadProcessedImage() {
    if (!imageURL) {
      alert('Спочатку завантажте фото.');
      return;
    }

    if (processingStatus !== 'completed') {
      alert('Дочекайтеся завершення обробки, щоб завантажити результат.');
      return;
    }

    if (!processedImageURL) {
      alert('Результат обробки відсутній. Запустіть обробку ще раз.');
      return;
    }

    const link = document.createElement('a');
    link.href = processedImageURL;
    link.download = `processed-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setProcessingMessage('Файл завантажено.');
    patchActiveTask({ resultSummary: 'Файл завантажено користувачем' });
  }
  useEffect(() => {
    return () => {
      revokeImageURL(imageURL);
    };
  }, [imageURL]);

  useEffect(() => {
    return () => {
      if (processedImageURL && processedImageURL.startsWith('blob:')) {
        URL.revokeObjectURL(processedImageURL);
      }
    };
  }, [processedImageURL]);

  useEffect(() => {
    return () => {
      clearProcessingTimer();
    };
  }, [clearProcessingTimer]);

  useEffect(() => {
    if (!isAuthenticated) {
      setTasks([]);
      setTasksError('');
      clearActiveTask();
      return;
    }
    refreshTasks();
  }, [isAuthenticated, refreshTasks, clearActiveTask]);

  // --- Текст для UI ---
  const processingStatusText = (() => {
    switch (processingStatus) {
      case 'running':
        return 'Виконується…';
      case 'completed':
        return 'Готово';
      case 'cancelled':
        return 'Скасовано';
      case 'error':
        return 'Помилка';
      default:
        return 'Очікування';
    }
  })();

  const stageText = processingMessage || getProcessingStage(processingProgress);

  // --- Рендер ---
  if (!isAuthenticated) {
    return (
      <>
        <nav className="toolbar">
          <span className="toolbar-brand">IMAGE MANAGER</span>
        </nav>
        <AuthPanel onLogin={handleAuth} loading={authLoading} />
      </>
    );
  }

  return (
    <AppLayout
      toolbar={{
        email: currentUser?.email ?? '',
        onLogout: handleLogout,
        logoutDisabled: authLoading,
      }}
      
      topControls={{
        fileInputRef,
        onFileChange: handleImageUpload,
        onOpenPicker: openFilePicker,
        onClearImage: clearImage,
        hasImage: Boolean(imageURL),
      }}

      processing={{
        maxComplexity: MAX_TASK_COMPLEXITY,
        currentComplexity,
        errorMessage: processingError,
        statusText: processingStatusText,
        status: processingStatus,
        progress: processingProgress,
        stageText,
        activeTaskId,
        onStart: startProcessingTask,
        onCancel: cancelProcessingTask,
        onDownload: downloadProcessedImage,
        disableStart: processingStatus === 'running',
        disableCancel: processingStatus !== 'running',
        disableDownload: processingStatus !== 'completed',
      }}
      taskHistory={{
        tasks,
        isLoading: isLoadingTasks,
        error: tasksError,
      }}
      workspace={{
        imageURL,
        imageStyle: getImageStyle(),
        options,
        selectedOptionIndex,
        onSelectOption: setSelectedOptionIndex,
        slider: {
          min: selectedOption.range.min,
          max: selectedOption.range.max,
          value: selectedOption.value,
          onChange: handleSliderChange,
        },
      }}
    />
  );
}

export default AppContainer;
