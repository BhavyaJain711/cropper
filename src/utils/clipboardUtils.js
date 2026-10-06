/**
 * Utility functions for clipboard interactions (copying images and text).
 */

/**
 * Convert a Data URL string into a binary Blob.
 * @param {string} dataurl 
 * @returns {Blob|null}
 */
export function dataURLtoBlob(dataurl) {
  if (!dataurl) return null;
  try {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (err) {
    console.error('Error converting DataURL to Blob:', err);
    return null;
  }
}

/**
 * Convert any image blob to a PNG blob using an offscreen canvas.
 * @param {Blob} blob 
 * @returns {Promise<Blob>}
 */
export async function convertBlobToPng(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          resolve(pngBlob);
        } else {
          reject(new Error('Canvas PNG export returned empty blob.'));
        }
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image element for PNG conversion.'));
    };
    img.src = url;
  });
}

/**
 * Copies an image to the system clipboard as image/png.
 * @param {Blob | string} imageSource - Blob or Data URL of the image
 * @returns {Promise<boolean>}
 */
export async function copyImageToClipboard(imageSource) {
  let blob = null;

  if (imageSource instanceof Blob) {
    blob = imageSource;
  } else if (typeof imageSource === 'string') {
    if (imageSource.startsWith('data:')) {
      blob = dataURLtoBlob(imageSource);
    } else {
      const res = await fetch(imageSource);
      blob = await res.blob();
    }
  }

  if (!blob) {
    throw new Error('No image data found to copy.');
  }

  // Ensure blob is PNG (Async Clipboard API requires image/png across all major browsers)
  if (blob.type !== 'image/png') {
    blob = await convertBlobToPng(blob);
  }

  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error('Your browser does not support copying images to the clipboard.');
  }

  const item = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);
  return true;
}

/**
 * Copies text to the system clipboard.
 * @param {string} text 
 * @returns {Promise<boolean>}
 */
export async function copyTextToClipboard(text) {
  if (!text) {
    throw new Error('No text to copy.');
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  // Fallback
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  const successful = document.execCommand('copy');
  document.body.removeChild(textArea);
  if (!successful) {
    throw new Error('Failed to copy text using fallback method.');
  }
  return true;
}
