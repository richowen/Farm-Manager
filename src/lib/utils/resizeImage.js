import { parse } from 'exifr';

export async function resizeImage(file, {
  maxWidth = 1920,
  maxHeight = 1920,
  quality = 0.50,
  type = 'image/jpeg'
} = {}) {
  let orientation = 1;
  try {
    const exif = await parse(file, ['Orientation']);
    orientation = exif?.Orientation ?? 1;
  } catch {}

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      const swapped = orientation >= 5 && orientation <= 8;
      const naturalWidth  = swapped ? height : width;
      const naturalHeight = swapped ? width  : height;

      let targetWidth  = naturalWidth;
      let targetHeight = naturalHeight;
      if (naturalWidth > maxWidth || naturalHeight > maxHeight) {
        const ratio = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
        targetWidth  = Math.round(naturalWidth  * ratio);
        targetHeight = Math.round(naturalHeight * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      applyExifOrientation(ctx, orientation, targetWidth, targetHeight);
      ctx.drawImage(img, 0, 0, swapped ? targetHeight : targetWidth, swapped ? targetWidth : targetHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Canvas toBlob failed'));
          resolve(new File([blob], file.name, { type, lastModified: Date.now() }));
        },
        type,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };

    img.src = url;
  });
}

function applyExifOrientation(ctx, orientation, width, height) {
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, height, width); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
  }
}
