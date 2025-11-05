export function getProcessingStage(progress) {
  if (progress === 0) return 'Очікує запуску';
  if (progress < 40) return 'Підготовка зображення';
  if (progress < 80) return 'Застосування фільтрів';
  if (progress < 100) return 'Фіналізація обробки';
  return 'Обробка завершена';
}
