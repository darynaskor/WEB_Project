import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import Slider from './Slider.jsx'
import SidebarItem from './SidebarItem.jsx';
import HistoryPanel from './HistoryPanel.jsx';
import TaskHistory from './TaskHistory.jsx';
import AuthPanel from './AuthPanel.jsx';
import { fetchTasks, createTask, updateTask, cancelTask } from '../api/tasks.js';
import { login as loginRequest, register as registerRequest } from '../api/auth.js';

const DEFAULT_OPTIONS=[
  {
    name:'BRIGHTNESS',
    property:'brightness',
    value:100,
    range:{
      min:0,
      max:200
    },
    unit: '%'
  },
    {
    name:'CONTRAST',
    property:'contrast',
    value:100,
    range:{
      min:0,
      max:200
    },
    unit: '%'
  },
    {
    name:'SATURATION',
    property:'saturate',
    value:100,
    range:{
      min:0,
      max:200
    },
    unit: '%'
  },
    {
    name:'GRAYSCALE',
    property:'grayscale',
    value:0,
    range:{
      min:0,
      max:100
    },
    unit: '%'
  },
    {
    name:'SEPIA',
    property:'sepia',
    value:0,
    range:{
      min:0,
      max:100
    },
    unit: '%'
  },
      {
    name:'HUE',
    property:'hue-rotate',
    value:0,
    range:{
      min:0,
      max:360
    },
    unit: 'deg'
  },
      {
    name:'BLUR',
    property:'blur',
    value:0,
    range:{
      min:0,
      max:20
    },
    unit: 'px'
  }
]

function deepCopyOptions(options){
  return options.map(o => ({ ...o, range: { ...o.range } }));
}

const MAX_HISTORY_ENTRIES = 10;
const MAX_TASK_COMPLEXITY = 70;

function buildFilterString(optionList) {
  return optionList.map(option => `${option.property}(${option.value}${option.unit})`).join(' ');
}

function calculateTaskComplexity(currentOptions, baselineOptions) {
  return currentOptions.reduce((total, option, index) => {
    const baselineValue = baselineOptions[index]?.value ?? 0;
    return total + Math.abs(option.value - baselineValue);
  }, 0);
}

function getProcessingStage(progress) {
  if (progress === 0) return 'Очікує запуску';
  if (progress < 40) return 'Підготовка зображення';
  if (progress < 80) return 'Застосування фільтрів';
  if (progress < 100) return 'Фіналізація обробки';
  return 'Обробка завершена';
}

function createHistoryEntry({
  action,
  label,
  previousValue,
  newValue,
  unit,
  resultOptions,
  selectedIndex,
}) {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    timestamp: new Date().toISOString(),
    action,
    label,
    previousValue,
    newValue,
    unit,
    resultOptions: resultOptions ? deepCopyOptions(resultOptions) : null,
    selectedIndex,
  };
}

function revokeImageURL(url) {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function App(){
  const[selectedOptionIndex, setselectedOptionIndex]=useState(0)
  const[options, setOptions]=useState(deepCopyOptions(DEFAULT_OPTIONS))
  const [imageURL, setImageURL] = useState(null);
  const fileInputRef = useRef(null); // ADDED: ref to hidden file input
  const initialOptionsRef = useRef(deepCopyOptions(DEFAULT_OPTIONS)); // ADDED: store initial for RESET
  const [history, setHistory] = useState([]); // ADDED: history log for UI
  const [undoStack, setUndoStack] = useState([]); // ADDED: undo stack for BACK
  const [processingStatus, setProcessingStatus] = useState('idle');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingError, setProcessingError] = useState('');
  const [processedImageURL, setProcessedImageURL] = useState(null);
  const processingTimerRef = useRef(null);
  const processedOptionsRef = useRef(null);
  const processingSessionRef = useRef(0);
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

  const clearProcessingTimer = () => {
    if (processingTimerRef.current) {
      clearInterval(processingTimerRef.current);
      processingTimerRef.current = null;
    }
  };

  const storeProcessedImageURL = (url) => {
    setProcessedImageURL(prev => {
      if (prev && prev.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      return url;
    });
  };

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

  function cleanupProcessedResult() {
    storeProcessedImageURL(null);
    processedOptionsRef.current = null;
  }

  function generateProcessedImageURL(imageSrc, filtersSnapshot) {
    return new Promise((resolve, reject) => {
      if (!imageSrc) {
        reject(new Error('Missing image source'));
        return;
      }

      const filterSource = Array.isArray(filtersSnapshot) ? filtersSnapshot : DEFAULT_OPTIONS;
      const filterString = buildFilterString(filterSource);
      const img = new Image();
      if (!imageSrc.startsWith('blob:') && !imageSrc.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          ctx.filter = filterString;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => {
            if (!blob) {
              reject(new Error('Failed to create blob from canvas'));
              return;
            }
            const resultURL = URL.createObjectURL(blob);
            resolve(resultURL);
          }, 'image/png', 0.92);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image for processing'));
      };

      img.src = imageSrc;
    });
  }

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
    const newVal = Number(target.value); // ADDED: ensure numeric
    const currentVal = options[selectedOptionIndex].value;
    if (newVal === currentVal) return; // nothing changed -> don't push to history

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

// ADDED: handle upload (revoke previous URL to avoid leaks)
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

  // даємо можливість повторно вибрати той самий файл
  e.target.value = '';
};



// ADDED: open hidden file input
function openFilePicker(){
  fileInputRef.current?.click();
}

// ADDED: clear image
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
    setProcessingError(`Складність задачі (${complexity}) перевищує максимально допустиме значення ${MAX_TASK_COMPLEXITY}. Зменште інтенсивність фільтрів та спробуйте знову.`);
    return;
  }

  cleanupProcessedResult();
  processingSessionRef.current += 1;
  const sessionId = processingSessionRef.current;
  clearProcessingTimer();
  setProcessingError('');
  setProcessingStatus('running');
  setProcessingProgress(0);
  setProcessingMessage('Підготовка зображення...');

  const snapshot = deepCopyOptions(options);
  let createdTask;
  try {
    createdTask = await createTask({
      filters: snapshot,
      complexity,
      imageName: uploadedFileName || null,
    }, authToken);
    setActiveTaskId(createdTask.id);
    activeTaskIdRef.current = createdTask.id;
    refreshTasks(false);
  } catch (error) {
    setProcessingStatus('error');
    setProcessingProgress(0);
    setProcessingMessage('');
    setProcessingError(error?.message ?? 'Не вдалося створити задачу.');
    refreshTasks(false);
    return;
  }

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

async function cancelProcessingTask(){
  if (processingStatus !== 'running') return;
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
  setselectedOptionIndex(restoredIndex);

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
  setselectedOptionIndex(0);

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

// ADDED: cleanup objectURL on unmount
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
}, []);

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
  return () => {
    const taskId = activeTaskIdRef.current;
    if (taskId && authToken) {
      cancelTask(taskId, authToken).catch(() => {
        // ігноруємо помилку під час виходу
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
  setselectedOptionIndex(targetIndex);

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
    <> 
      <nav className="toolbar">
        <span className="toolbar-brand">IMAGE MANAGER</span>
        <div className="toolbar-user">
          <span className="toolbar-email">{currentUser?.email}</span>
          <button className="toolbar-logout" type="button" onClick={handleLogout} disabled={authLoading}>
            Вийти
          </button>
        </div>
      </nav>

      {/* ADDED: hidden input + visible upload/clear/back/reset buttons */}
      <div className="top-controls">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{ display: 'none' }}
        />
        <button className="btn" onClick={openFilePicker}>UPLOAD</button>
        <button className="btn" onClick={clearImage} disabled={!imageURL}>DELETE</button>
        <button className="btn" onClick={handleBack} disabled={undoStack.length === 0}>BACK</button>
        <button className="btn" onClick={handleReset}>RESET</button>
      </div>

      <div className="processing-panel">
        <div className="processing-header">
          <h3>Обробка зображення</h3>
          <p>Максимальна складність задачі — {MAX_TASK_COMPLEXITY}. Поточне значення: {currentComplexity}.</p>
        </div>
        {processingError ? <div className="processing-error">{processingError}</div> : null}
        <div className="processing-actions">
          <button
            className="btn"
            onClick={startProcessingTask}
            disabled={processingStatus === 'running'}
          >
            Запустити обробку
          </button>
          <button
            className="btn btn-stop"
            onClick={cancelProcessingTask}
            disabled={processingStatus !== 'running'}
          >
            Скасувати
          </button>
          <button
            className="btn btn-download"
            onClick={downloadProcessedImage}
            disabled={processingStatus !== 'completed'}
          >
            Завантажити результат
          </button>
        </div>
        <div className="processing-progress">
          <div className="processing-status">
            <span>Статус: {processingStatusText}</span>
            <span>{processingProgress}%</span>
          </div>
          <div className="processing-track">
            <div
              className="processing-bar"
              style={{ width: `${processingProgress}%` }}
            />
          </div>
          <div className="processing-stage">{stageText}</div>
          <div className="processing-current-task">
            Активна задача: {activeTaskId ? `#${activeTaskId}` : '—'}
          </div>
        </div>
      </div>

      <TaskHistory tasks={tasks} isLoading={isLoadingTasks} error={tasksError} />

      <div className="container">
        <div className="main-image" style={getImageStyle()}>
          {/* ADDED: show uploaded image if present */}
          {imageURL ? (
            <img src={imageURL} alt="Uploaded" className="image-preview" />
          ) : null}
        </div>

        <div className="sidebar">
          {options.map((option,index)=>{
            return (
            <SidebarItem
            key={index}
            name={option.name}
            active={index === selectedOptionIndex}
            handleClick={()=>setselectedOptionIndex(index)}
            />
          )
          })}
          <HistoryPanel history={history} onRestore={handleHistoryRestore} />
        </div>

        <Slider 
        min={selectedOption.range.min}
        max={selectedOption.range.max}
        value={selectedOption.value}
        handleChange={handleSliderChange}
        />
      </div>
    </>
  )
}

export default App;
