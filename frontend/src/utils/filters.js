import { DEFAULT_OPTIONS } from '../config/filters.js';

export function deepCopyOptions(options = DEFAULT_OPTIONS) {
  return options.map(option => ({ ...option, range: { ...option.range } }));
}

export function buildFilterString(optionList) {
  return optionList.map(option => `${option.property}(${option.value}${option.unit})`).join(' ');
}

export function calculateTaskComplexity(currentOptions, baselineOptions = DEFAULT_OPTIONS) {
  return currentOptions.reduce((total, option, index) => {
    const baselineValue = baselineOptions[index]?.value ?? 0;
    return total + Math.abs(option.value - baselineValue);
  }, 0);
}
