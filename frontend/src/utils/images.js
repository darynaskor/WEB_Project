import { DEFAULT_OPTIONS } from '../config/filters.js';
import { buildFilterString } from './filters.js';

export function revokeImageURL(url) {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

export function generateProcessedImageURL(imageSrc, filtersSnapshot = DEFAULT_OPTIONS) {
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
