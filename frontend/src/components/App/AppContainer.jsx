import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import AuthPanel from '../AuthPanel.jsx';
import AppLayout from './AppLayout.jsx';
import { fetchTasks, createTask, updateTask, cancelTask } from '../../api/tasks.js';
import { login as loginRequest, register as registerRequest } from '../../api/auth.js';
import {
  DEFAULT_OPTIONS,
  MAX_HISTORY_ENTRIES,
  MAX_TASK_COMPLEXITY,
} from '../../config/filters.js';
import {
  buildFilterString,
  calculateTaskComplexity,
  deepCopyOptions,
} from '../../utils/filters.js';
import { createHistoryEntry } from '../../utils/history.js';
import { generateProcessedImageURL, revokeImageURL } from '../../utils/images.js';
import { getProcessingStage } from '../../utils/processing.js';

function AppContainer() {
  const[selectedOptionIndex, setSelectedOptionIndex]=useState(0)
  const[options, setOptions]=useState(deepCopyOptions(DEFAULT_OPTIONS))
  const [imageURL, setImageURL] = useState(null);
  const fileInputRef = useRef(null); 
  const initialOptionsRef = useRef(deepCopyOptions(DEFAULT_OPTIONS)); 
  const [history, setHistory] = useState([]); 
  const [undoStack, setUndoStack] = useState([]); 
  const [processingStatus, setProcessingStatus] = useState('idle');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingError, setProcessingError] = useState('');
  const [processedImageURL, setProcessedImageURL] = useState(null);
  const processingTimerRef = useRef(null);
  const processedOptionsRef = useRef(null);
  const processingSessionRef = useRef(0);
  ///
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
  const [tasks, setTasks] = useState([]);
  const [tasksError, setTasksError] = useState('');
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const activeTaskIdRef = useRef(null);
  const tasksPollRef = useRef(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const isAuthenticated = Boolean(authToken && currentUser);
  const [queuedTaskInfo, setQueuedTaskInfo] = useState(null);
  const queuedCheckRef = useRef(null);

  const clearActiveTask = useCallback(() => {
    setActiveTaskId(null);
    activeTaskIdRef.current = null;
  }, []);

  const refreshTasks = useCallback(async (withSpinner = false) => {
    try {
      if (!authToken) {
        setTasks([]);
        setTasksError('');
        clearActiveTask();
        return;
      }
      if (withSpinner) setIsLoadingTasks(true);
      const list = await fetchTasks(authToken);
      setTasks(list);
      setTasksError('');
    } catch (error) {
      const message = error?.message ?? 'Не вдалося завантажити історію задач.';
      setTasksError(message);
    } finally {
      if (withSpinner) setIsLoadingTasks(false);
    }
  }, [authToken, clearActiveTask]);

  const patchActiveTask = useCallback(async (payload, options = {}) => {
    const taskId = activeTaskIdRef.current;
    if (!taskId) return;
    if (!authToken) return;
    const shouldRefresh = options.refresh ?? true;
    try {
      await updateTask(taskId, payload, authToken);
      if (shouldRefresh) {
        refreshTasks(false);
      }
    } catch (error) {
      console.error('Не вдалося оновити задачу:', error);
    }
  }, [authToken, refreshTasks]);

  const cancelActiveTaskOnServer = useCallback(async (options = {}) => {
    const taskId = activeTaskIdRef.current;
    if (!taskId) return;
    if (!authToken) return;
    const shouldRefresh = options.refresh ?? true;
    try {
      await cancelTask(taskId, authToken);
    } catch (error) {
      console.error('Не вдалося скасувати задачу:', error);
    } finally {
      clearActiveTask();
      if (shouldRefresh) {
        refreshTasks(false);
      }
    }
  }, [authToken, clearActiveTask, refreshTasks]);

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

  const handleAuth = useCallback(async ({ mode, email, password }) => {
    setAuthLoading(true);
    try {
      const action = mode === 'register' ? registerRequest : loginRequest;
      const { token, user } = await action(email, password);
      persistAuth(token, user);
      clearActiveTask();
      try {
        const list = await fetchTasks(token);
        setTasks(list);
        setTasksError('');
      } catch (error) {
        setTasksError(error?.message ?? 'Не вдалося завантажити історію задач.');
      }
    } finally {
      setAuthLoading(false);
    }
  }, [clearActiveTask, persistAuth]);

  const clearProcessingTimer = useCallback(() => {
    if (processingTimerRef.current) {
      clearInterval(processingTimerRef.current);
      processingTimerRef.current = null;
    }
  }, []);

  const storeProcessedImageURL = useCallback((url) => {
    setProcessedImageURL(prev => {
      if (prev && prev.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      return url;
    });
  }, []);
  function runProcessingInterval({ sessionId, complexity }) {
    const estimatedDuration = Math.max(4000, complexity * 35); // мс
    const step = 5;
    const intervalDelay = Math.max(200, Math.floor(estimatedDuration / (100 / step)));

    processingTimerRef.current = setInterval(() => {
      setProcessingProgress(prev => {
        const next = Math.min(prev + step, 100);
        if (next >= 100) {
          clearProcessingTimer();
          const snapshotOptions = deepCopyOptions(options);
          const baseImage = imageURL;
          if (!baseImage) {
            processedOptionsRef.current = null;
            storeProcessedImageURL(null);
            setProcessingStatus('error');
            setProcessingMessage('');
            setProcessingError('Зображення було видалено до завершення обробки.');
            patchActiveTask({ status: 'failed', progress: next, errorMessage: 'Зображення видалено до завершення.' });
            clearActiveTask();
            return next;
          }
          processedOptionsRef.current = snapshotOptions;
          setProcessingStatus('completed');
          setProcessingMessage('Формуємо файл для завантаження...');
          generateProcessedImageURL(baseImage, snapshotOptions)
            .then(url => {
              if (processingSessionRef.current !== sessionId) {
                if (url && typeof url === 'string' && url.startsWith('blob:')) {
                  URL.revokeObjectURL(url);
                }
                return;
              }
              storeProcessedImageURL(url);
              setProcessingMessage('Обробка завершена, файл готовий до завантаження.');
              setProcessingError('');
              patchActiveTask({ status: 'completed', progress: 100, resultSummary: 'Файл готовий до завантаження.' });
              clearActiveTask();
            })
            .catch(() => {
              if (processingSessionRef.current === sessionId) {
                storeProcessedImageURL(null);
                setProcessingStatus('error');
                setProcessingError('Не вдалося підготувати файл для завантаження. Спробуйте ще раз.');
                setProcessingMessage('');
                patchActiveTask({ status: 'failed', progress: next, errorMessage: 'Не вдалося сформувати файл.' });
                clearActiveTask();
              }
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
    cleanupProcessedResult();
    clearProcessingTimer();
    processingSessionRef.current += 1;
    setProcessingStatus('idle');
    setProcessingProgress(0);
    setProcessingMessage('');
    setProcessingError('');
    setTasks([]);
    setUploadedFileName('');
    setHistory([]);
    setUndoStack([]);
    persistAuth('', null);
  }, [cancelActiveTaskOnServer, clearProcessingTimer, persistAuth]);

  const selectedOption=options[selectedOptionIndex]
  const currentComplexity = calculateTaskComplexity(options, initialOptionsRef.current);

  const addHistoryEntry = (entry) => {
    if (!entry) return;
    setHistory(prev => {
      const next = [...prev, entry];
      if (next.length > MAX_HISTORY_ENTRIES) next.shift();
      return next;
    });
  };

  const cleanupProcessedResult = useCallback(() => {
    storeProcessedImageURL(null);
    processedOptionsRef.current = null;
    setQueuedTaskInfo(null);
  }, [storeProcessedImageURL]);

  const pushUndoSnapshot = ({
    optionsSnapshot,
    selectedIndex,
    action,
    label,
    previousValue,
    newValue,
    unit,
  }) => {
    if (!optionsSnapshot) return;
    setUndoStack(prev => {
      const next = [
        ...prev,
        {
          options: optionsSnapshot,
          selectedIndex,
          action,
          label,
          previousValue,
          newValue,
          unit,
        },
      ];
      if (next.length > MAX_HISTORY_ENTRIES) next.shift();
      return next;
    });
  };

  function handleSliderChange({target}){
    const newVal = Number(target.value); 
    const currentVal = options[selectedOptionIndex].value;
    if (newVal === currentVal) return; 

    if (processingStatus !== 'idle') {
      clearProcessingTimer();
      cleanupProcessedResult();
      cancelActiveTaskOnServer();
      processingSessionRef.current += 1;
      setProcessingStatus('idle');
      setProcessingProgress(0);
      setProcessingMessage('');
      setProcessingError('');
    }

    const snapshot = deepCopyOptions(options);
    pushUndoSnapshot({
      optionsSnapshot: snapshot,
      selectedIndex: selectedOptionIndex,
      action: 'adjust',
      label: selectedOption.name,
      previousValue: currentVal,
      newValue: newVal,
      unit: selectedOption.unit,
    });

    const updatedOptions = options.map((option,index)=>{
      if(index !==selectedOptionIndex) return option
      return{...option,value:newVal}
    });
    setOptions(updatedOptions);

    const entry = createHistoryEntry({
      action: 'adjust',
      label: selectedOption.name,
      previousValue: currentVal,
      newValue: newVal,
      unit: selectedOption.unit,
      resultOptions: updatedOptions,
      selectedIndex: selectedOptionIndex,
    });
    addHistoryEntry(entry);
  }

function getImageStyle(){
  const filters = buildFilterString(options);
  return {filter:filters}
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
  cleanupProcessedResult();
  clearProcessingTimer();
  processingSessionRef.current += 1;
  setProcessingStatus('idle');
  setProcessingProgress(0);
  setProcessingMessage('');
  setProcessingError('');

  revokeImageURL(imageURL);

  const objectUrl = URL.createObjectURL(file);
  setImageURL(objectUrl);
  setUploadedFileName(file.name || '');

  e.target.value = '';
};

function openFilePicker(){
  fileInputRef.current?.click();
}

async function clearImage(){
  if(imageURL){
    revokeImageURL(imageURL);
    setImageURL(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
  setUploadedFileName('');
  await cancelActiveTaskOnServer();
  cleanupProcessedResult();
  clearProcessingTimer();
  processingSessionRef.current += 1;
  setProcessingStatus('idle');
  setProcessingProgress(0);
  setProcessingMessage('');
  setProcessingError('');
}

async function startProcessingTask(){
  if (processingStatus === 'running' || processingStatus === 'queued') return;
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
    setProcessingError(`Складність задачі (${complexity}) перевищує максимально допустиме значення ${MAX_TASK_COMPLEXITY}. Зменште інтенсивність фільтрів та спробуйте знову.`);
    return;
  }

  cleanupProcessedResult();
  processingSessionRef.current += 1;
  const sessionId = processingSessionRef.current;
  clearProcessingTimer();
  setProcessingError('');
  setProcessingProgress(0);

  const snapshot = deepCopyOptions(options);
  try {
    const createResponse = await createTask({
      filters: snapshot,
      complexity,
      imageName: uploadedFileName || null,
    }, authToken);
    const createdTask = createResponse.task;
    setActiveTaskId(createdTask.id);
    activeTaskIdRef.current = createdTask.id;
    refreshTasks(false);
    if (createResponse.queued) {
      setProcessingStatus('queued');
      const estimate = createResponse.estimatedWaitSeconds ?? 0;
      const position = createResponse.queuePosition ?? 1;
      setProcessingMessage(`Запит поставлено у чергу (позиція ${position}). Орієнтовний час очікування ~ ${Math.max(estimate, 1)} с.`);
      setProcessingProgress(0);
      setQueuedTaskInfo({
        taskId: createdTask.id,
        sessionId,
        complexity,
        estimatedWaitSeconds: estimate,
        queuePosition: position,
      });
      return;
    }
  } catch (error) {
    setProcessingStatus('error');
    setProcessingProgress(0);
    setProcessingMessage('');
    setProcessingError(error?.message ?? 'Не вдалося створити задачу.');
    refreshTasks(false);
    return;
  }

  setProcessingStatus('running');
  setProcessingMessage('Підготовка зображення...');
  setProcessingProgress(0);
  runProcessingInterval({ sessionId, complexity });
}

async function cancelProcessingTask(){
  if (processingStatus !== 'running' && processingStatus !== 'queued') return;
  clearProcessingTimer();
  setProcessingStatus('cancelled');
  setProcessingProgress(0);
  setProcessingMessage('Обробку скасовано.');
  setProcessingError('');
  cleanupProcessedResult();
  processingSessionRef.current += 1;
  await cancelActiveTaskOnServer();
}

function downloadProcessedImage(){
  if (!imageURL) {
    alert('Спочатку завантажте фото.');
    return;
  }

  if (processingStatus !== 'completed') {
    alert('Дочекайтеся завершення обробки, щоб завантажити результат.');
    return;
  }

  if (!processedOptionsRef.current) {
    alert('Результат обробки відсутній. Запустіть обробку ще раз.');
    return;
  }

  const sessionId = processingSessionRef.current;
  const ensureResult = processedImageURL
    ? Promise.resolve(processedImageURL)
    : generateProcessedImageURL(imageURL, processedOptionsRef.current).then(url => {
        if (!url) {
          throw new Error('empty-url');
        }
        if (processingSessionRef.current !== sessionId) {
          if (typeof url === 'string' && url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
          }
          throw new Error('session-changed');
        }
        storeProcessedImageURL(url);
        return url;
      });

  setProcessingError('');
  setProcessingMessage('Готуємо файл до завантаження...');
  ensureResult
    .then(url => {
      if (!url) {
        setProcessingError('Не вдалося підготувати файл для завантаження. Спробуйте ще раз.');
        return;
      }
      const link = document.createElement('a');
      link.href = url;
      link.download = `processed-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setProcessingMessage('Файл завантажено.');
      patchActiveTask({ resultSummary: 'Файл завантажено користувачем' });
    })
    .catch(error => {
      if (error && error.message === 'session-changed') {
        return;
      }
      setProcessingError('Не вдалося підготувати файл для завантаження. Спробуйте ще раз.');
    });
}

// ADDED: Back (undo one step)
function handleBack(){
  if (undoStack.length === 0) return;

  const lastSnapshot = undoStack[undoStack.length - 1];
  const restoredOptions = deepCopyOptions(lastSnapshot.options);
  const restoredIndex = typeof lastSnapshot.selectedIndex === 'number' ? lastSnapshot.selectedIndex : 0;

  setUndoStack(prev => prev.slice(0, -1));

  setOptions(restoredOptions);
  setSelectedOptionIndex(restoredIndex);

  const labelForBack = lastSnapshot.label || lastSnapshot.action || 'Back';
  const unitForBack = lastSnapshot.unit ?? '';
  const previousValue = lastSnapshot.newValue ?? null;
  const newValue = lastSnapshot.previousValue ?? null;

  const entry = createHistoryEntry({
    action: 'back',
    label: labelForBack,
    previousValue,
    newValue,
    unit: unitForBack,
    resultOptions: restoredOptions,
    selectedIndex: restoredIndex,
  });
  addHistoryEntry(entry);

  cancelActiveTaskOnServer();
  cleanupProcessedResult();
  clearProcessingTimer();
  setProcessingStatus('idle');
  setProcessingProgress(0);
  setProcessingMessage('');
  setProcessingError('');
  processingSessionRef.current += 1;
}

// ADDED: Reset to initial options
function handleReset(){
  const currentSnapshot = deepCopyOptions(options);
  pushUndoSnapshot({
    optionsSnapshot: currentSnapshot,
    selectedIndex: selectedOptionIndex,
    action: 'reset',
    label: 'Reset',
    previousValue: null,
    newValue: null,
    unit: '',
  });

  const defaults = deepCopyOptions(initialOptionsRef.current);
  setOptions(defaults);
  setSelectedOptionIndex(0);

  const entry = createHistoryEntry({
    action: 'reset',
    label: 'Reset',
    previousValue: null,
    newValue: null,
    unit: '',
    resultOptions: defaults,
    selectedIndex: 0,
  });
  addHistoryEntry(entry);

  cancelActiveTaskOnServer();
  cleanupProcessedResult();
  clearProcessingTimer();
  setProcessingStatus('idle');
  setProcessingProgress(0);
  setProcessingMessage('');
  setProcessingError('');
  processingSessionRef.current += 1;
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
    if (tasksPollRef.current) {
      clearInterval(tasksPollRef.current);
      tasksPollRef.current = null;
    }
    setTasks([]);
    setTasksError('');
    return () => {};
  }

  refreshTasks(true);
  tasksPollRef.current = setInterval(() => {
    refreshTasks(false);
  }, 5000);
  return () => {
    if (tasksPollRef.current) {
      clearInterval(tasksPollRef.current);
      tasksPollRef.current = null;
    }
  };
}, [isAuthenticated, refreshTasks]);

useEffect(() => {
  if (!queuedTaskInfo || !authToken) {
    if (queuedCheckRef.current) {
      clearInterval(queuedCheckRef.current);
      queuedCheckRef.current = null;
    }
    return undefined;
  }

  const attemptActivation = async () => {
    try {
      const task = await updateTask(queuedTaskInfo.taskId, { status: 'running' }, authToken);
      if (task?.status === 'running') {
        if (queuedCheckRef.current) {
          clearInterval(queuedCheckRef.current);
          queuedCheckRef.current = null;
        }
        setQueuedTaskInfo(null);
        setActiveTaskId(task.id);
        activeTaskIdRef.current = task.id;
        setProcessingStatus('running');
        setProcessingMessage('Підготовка зображення...');
        setProcessingProgress(0);
        runProcessingInterval({ sessionId: queuedTaskInfo.sessionId, complexity: queuedTaskInfo.complexity });
        refreshTasks(false);
      }
    } catch (error) {
      if (error?.status === 409 && error?.details?.estimatedWaitSeconds) {
        const estimate = Math.max(error.details.estimatedWaitSeconds, 1);
        const position = error.details.queuePosition ?? queuedTaskInfo.queuePosition ?? 1;
        setProcessingMessage(`Запит все ще у черзі (позиція ${position}). Орієнтовний час очікування ~ ${estimate} с.`);
        setQueuedTaskInfo((prev) => (prev ? { ...prev, estimatedWaitSeconds: estimate, queuePosition: position } : prev));
      } else if (error?.status && error?.status >= 400) {
        setProcessingError(error?.message ?? 'Не вдалося активувати задачу.');
      }
    }
  };

  attemptActivation();
  queuedCheckRef.current = setInterval(attemptActivation, 5000);
  return () => {
    if (queuedCheckRef.current) {
      clearInterval(queuedCheckRef.current);
      queuedCheckRef.current = null;
    }
  };
}, [queuedTaskInfo, authToken, refreshTasks]);

useEffect(() => {
  return () => {
    const taskId = activeTaskIdRef.current;
    if (taskId && authToken) {
      cancelTask(taskId, authToken).catch(() => {
      });
    }
  };
}, [authToken]);

useEffect(() => {
  if (processingStatus === 'error' && !processingError && currentComplexity <= MAX_TASK_COMPLEXITY) {
    setProcessingStatus('idle');
    setProcessingError('');
    setProcessingMessage('');
    setProcessingProgress(0);
  }
}, [processingStatus, processingError, currentComplexity]);

function handleHistoryRestore(entry){
  if (!entry || !entry.resultOptions) return;

  const currentSnapshot = deepCopyOptions(options);
  pushUndoSnapshot({
    optionsSnapshot: currentSnapshot,
    selectedIndex: selectedOptionIndex,
    action: 'restore',
    label: entry.label || entry.action || 'History',
    previousValue: null,
    newValue: null,
    unit: '',
  });

  const restoredOptions = deepCopyOptions(entry.resultOptions);
  const targetIndex = typeof entry.selectedIndex === 'number' ? entry.selectedIndex : 0;

  setOptions(restoredOptions);
  setSelectedOptionIndex(targetIndex);

  const restoreEntry = createHistoryEntry({
    action: 'restore',
    label: entry.label || 'History restore',
    previousValue: null,
    newValue: null,
    unit: '',
    resultOptions: restoredOptions,
    selectedIndex: targetIndex,
  });
  addHistoryEntry(restoreEntry);

  cancelActiveTaskOnServer();
  cleanupProcessedResult();
  clearProcessingTimer();
  setProcessingStatus('idle');
  setProcessingProgress(0);
  setProcessingMessage('');
  setProcessingError('');
  processingSessionRef.current += 1;
}

const processingStatusText = (() => {
  switch (processingStatus) {
    case 'running':
      return 'Виконується…';
    case 'completed':
      return 'Готово';
    case 'cancelled':
      return 'Скасовано';
    case 'queued':
      return 'У черзі';
    case 'error':
      return 'Помилка';
    default:
      return 'Очікування';
  }
})();

const stageText = processingMessage || getProcessingStage(processingProgress);

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
      onBack: handleBack,
      onReset: handleReset,
      canUndo: undoStack.length > 0,
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
      history,
      onHistoryRestore: handleHistoryRestore,
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
