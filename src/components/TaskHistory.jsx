import React, { useEffect, useMemo, useRef } from 'react';

function formatDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

const statusLabels = {
  running: 'Виконується',
  completed: 'Завершено',
  cancelled: 'Скасовано',
  failed: 'Помилка',
  pending: 'Очікує запуску',
};

function TaskHistory({ tasks, isLoading, error }) {
  const orderedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aDate = new Date(a.createdAt).getTime();
      const bDate = new Date(b.createdAt).getTime();
      return aDate - bDate;
    });
  }, [tasks]);

  const listRef = useRef(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [orderedTasks.length]);

  return (
    <section className="task-history">
      <header className="task-history__header">
        <h3>Історія задач</h3>
        {isLoading ? <span className="task-history__status">Оновлення…</span> : null}
      </header>
      {error ? <div className="task-history__error">{error}</div> : null}
      {orderedTasks.length === 0 ? (
        <p className="task-history__empty">Жодної задачі поки немає.</p>
      ) : (
        <ul className="task-history__list" ref={listRef}>
          {orderedTasks.map(task => (
            <li key={task.id} className={`task-history__item task-history__item--${task.status}`}>
              <div className="task-history__item-row">
                <span className="task-history__label">Задача #{task.id}</span>
                <span className="task-history__value">{statusLabels[task.status] ?? task.status}</span>
              </div>
              <div className="task-history__item-row">
                <span className="task-history__label">Створено</span>
                <span className="task-history__value">{formatDate(task.createdAt)}</span>
              </div>
              <div className="task-history__item-row">
                <span className="task-history__label">Оновлено</span>
                <span className="task-history__value">{formatDate(task.updatedAt)}</span>
              </div>
              <div className="task-history__item-row">
                <span className="task-history__label">Прогрес</span>
                <span className="task-history__value">{task.progress}%</span>
              </div>
              <div className="task-history__item-row">
                <span className="task-history__label">Складність</span>
                <span className="task-history__value">{task.complexity}</span>
              </div>
              {task.imageName ? (
                <div className="task-history__item-row">
                  <span className="task-history__label">Файл</span>
                  <span className="task-history__value">{task.imageName}</span>
                </div>
              ) : null}
              <div className="task-history__item-row">
                <span className="task-history__label">Кількість фільтрів</span>
                <span className="task-history__value">{task.filters?.length ?? 0}</span>
              </div>
              {task.errorMessage ? (
                <div className="task-history__item-row task-history__item-row--error">
                  <span className="task-history__label">Помилка</span>
                  <span className="task-history__value">{task.errorMessage}</span>
                </div>
              ) : null}
              {task.resultSummary ? (
                <div className="task-history__item-row">
                  <span className="task-history__label">Результат</span>
                  <span className="task-history__value">{task.resultSummary}</span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default TaskHistory;
