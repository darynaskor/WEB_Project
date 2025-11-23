import React from 'react';
function ProcessingPanel({
  maxComplexity,
  currentComplexity,
  errorMessage,
  statusText,
  progress,
  stageText,
  activeTaskId,
  onStart,
  onCancel,
  onDownload,
  disableStart,
  disableCancel,
  disableDownload,
}) {
  return (
    <div className="processing-panel">
      <div className="processing-header">
        <h3>Обробка зображення</h3>
        <p>
          Максимальна складність задачі — {maxComplexity}. Поточне значення: {currentComplexity}.
        </p>
      </div>
      {errorMessage ? <div className="processing-error">{errorMessage}</div> : null}

      <div className="processing-actions">
        <button className="btn" type="button" onClick={onStart} disabled={disableStart}>
          Запустити обробку
        </button>

        <button className="btn btn-stop" type="button" onClick={onCancel} disabled={disableCancel}>
          Скасувати
        </button>

        <button className="btn btn-download" type="button" onClick={onDownload} disabled={disableDownload}>
          Завантажити результат
        </button>

      </div>
      <div className="processing-progress">
        <div className="processing-status">
          <span>Статус: {statusText}</span>
          <span>{progress}%</span>
        </div>

        <div className="processing-track">
          <div className="processing-bar" style={{ width: `${progress}%` }} />
        </div>

        <div className="processing-stage">{stageText}</div>
        <div className="processing-current-task">
          Активна задача: {activeTaskId ? `#${activeTaskId}` : '—'}
        </div>
        
      </div>
    </div>
  );
}

export default ProcessingPanel;
