import { deepCopyOptions } from './filters.js';

export function createHistoryEntry({
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
