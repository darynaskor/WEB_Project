import React from 'react';

function HistoryPanel({ history, onRestore }) {
  const orderedHistory = [...history].reverse();

  function formatTimestamp(value) {
    try {
      return new Intl.DateTimeFormat('uk-UA', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(value));
    } catch (error) {
      return value;
    }
  }

  function formatValue(value, unit) {
    if (value === null || value === undefined || value === '') return '';
    const stringValue = `${value}`;
    return unit ? `${stringValue}${unit}` : stringValue;
  }

  function getEntryLabel(entry) {
    const label = entry.label || entry.action || 'Дія';
    const unit = entry.unit ?? '';
    const from = formatValue(entry.previousValue, unit);
    const to = formatValue(entry.newValue, unit);

    switch (entry.action) {
      case 'adjust':
        return `${label}: ${from} → ${to}`;
      case 'back':
        if (from && to) {
          return `Back: ${label} ${from} → ${to}`;
        }
        return `Back: ${label}`;
      case 'reset':
        return 'Reset до початкових налаштувань';
      case 'restore':
        return `Restore: ${label}`;
      default:
        return label;
    }
  }

  return (
    <div className="history-panel">
      <h3 className="history-title">History</h3>
      {orderedHistory.length === 0 ? (
        <p className="history-empty">Жодних змін поки що немає</p>
      ) : (
        <ul className="history-list">
          {orderedHistory.map((entry) => (
            <li key={entry.id} className="history-list-item">
              <button
                type="button"
                className="history-item"
                onClick={() => onRestore(entry)}
              >
                <span className="history-item-time">{formatTimestamp(entry.timestamp)}</span>
                <span className="history-item-label">{getEntryLabel(entry)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default HistoryPanel;
