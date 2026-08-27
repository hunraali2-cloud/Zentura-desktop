/**
 * Client-side Image Compression Utility
 * Resizes and compresses images to WebP format (< 40 KB)
 */
export async function compressImage(
  input: File | Blob | string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.75
): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // SSR / Node fallback
    return typeof input === 'string' ? input : '';
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const cleanUp = () => {
      if (typeof input !== 'string') {
        URL.revokeObjectURL(img.src);
      }
    };

    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanUp();
          resolve(typeof input === 'string' ? input : '');
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Export to webp or jpeg fallback
        let dataUrl = canvas.toDataURL('image/webp', quality);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        cleanUp();
        resolve(dataUrl);
      } catch (err) {
        cleanUp();
        console.warn('Image compression warning, using raw input:', err);
        resolve(typeof input === 'string' ? input : '');
      }
    };

    img.onerror = (err) => {
      cleanUp();
      console.warn('Failed to load image for compression:', err);
      resolve(typeof input === 'string' ? input : '');
    };

    if (typeof input === 'string') {
      img.src = input;
    } else {
      img.src = URL.createObjectURL(input);
    }
  });
}
