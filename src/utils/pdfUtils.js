import * as pdfjsLib from 'pdfjs-dist';

// Set the worker to point to the file in public folder
pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.min.mjs";

/**
 * Load a PDF file and return the pdfjs document object.
 * @param {File} file 
 * @returns {Promise<pdfjsLib.PDFDocumentProxy>}
 */
export async function loadPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    useWorkerFetch: true,
    isEvalSupported: false,
    wasmUrl: window.location.origin + "/"
  });
  return loadingTask.promise;
}

/**
 * Render a specific page of a PDF document onto a canvas.
 * @param {pdfjsLib.PDFDocumentProxy} pdfDoc 
 * @param {number} pageNum 
 * @param {HTMLCanvasElement} canvas 
 * @param {number} scale 
 * @returns {Promise<{page: pdfjsLib.PDFPageProxy, viewport: pdfjsLib.PageViewport}>}
 */
export async function renderPage(pdfDoc, pageNum, canvas, scale = 1.5) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  const renderContext = {
    canvasContext: context,
    viewport: viewport
  };

  await page.render(renderContext).promise;
  return { page, viewport };
}

/**
 * Mathematical text extraction in a normalized bounding box.
 * @param {pdfjsLib.PDFPageProxy} page 
 * @param {{x1: number, y1: number, x2: number, y2: number}} rect - Normalized coordinates (0-1)
 * @param {pdfjsLib.PageViewport} viewport 
 */
export async function extractTextInRegion(page, rect, viewport) {
  const textContent = await page.getTextContent();
  const items = textContent.items;

  const minX = Math.min(rect.x1, rect.x2);
  const maxX = Math.max(rect.x1, rect.x2);
  const minY = Math.min(rect.y1, rect.y2);
  const maxY = Math.max(rect.y1, rect.y2);

  const overlappingItems = [];

  for (const item of items) {
    if (!item.transform) continue;

    const tx = item.transform;
    const itemPdfX = tx[4];
    const itemPdfY = tx[5];
    const itemPdfW = item.width;
    const itemPdfH = item.height || Math.abs(tx[3] || tx[0]); // Font size fallback

    // Convert PDF page points to viewport canvas coordinates
    const [xA, yA] = viewport.convertToViewportPoint(itemPdfX, itemPdfY);
    const [xB, yB] = viewport.convertToViewportPoint(itemPdfX + itemPdfW, itemPdfY + itemPdfH);

    // Canvas points min/max
    const vxMin = Math.min(xA, xB);
    const vxMax = Math.max(xA, xB);
    const vyMin = Math.min(yA, yB);
    const vyMax = Math.max(yA, yB);

    // Normalize coordinates back to page dimensions (0-1)
    const normXMin = vxMin / viewport.width;
    const normXMax = vxMax / viewport.width;
    const normYMin = vyMin / viewport.height;
    const normYMax = vyMax / viewport.height;

    // Check intersection with selection rectangle
    const intersectX = Math.max(0, Math.min(maxX, normXMax) - Math.max(minX, normXMin));
    const intersectY = Math.max(0, Math.min(maxY, normYMax) - Math.max(minY, normYMin));

    if (intersectX > 0 && intersectY > 0) {
      overlappingItems.push({
        str: item.str,
        fontName: item.fontName,
        fontSize: Math.abs(tx[3] || tx[0]),
        x: normXMin,
        y: normYMin,
        width: normXMax - normXMin,
        height: normYMax - normYMin
      });
    }
  }

  // Sort elements by Y coordinate (lines), then by X coordinate (within line)
  overlappingItems.sort((a, b) => {
    // 1.5% height threshold to group items into the same line
    if (Math.abs(a.y - b.y) < 0.015) {
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  // Group sorted items into rows
  const lines = [];
  let currentLine = [];
  let lastY = -1;

  for (const item of overlappingItems) {
    if (lastY === -1 || Math.abs(item.y - lastY) < 0.015) {
      currentLine.push(item);
    } else {
      lines.push(currentLine);
      currentLine = [item];
    }
    lastY = item.y;
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  // Build final lines text
  const extractedText = lines
    .map(line => {
      line.sort((a, b) => a.x - b.x);
      return line.map(item => item.str).join(' ');
    })
    .join('\n');

  // Analyze dominant styles
  let primaryFont = 'Normal';
  let avgFontSize = 10;

  if (overlappingItems.length > 0) {
    const fontFrequency = {};
    let totalFontSize = 0;

    overlappingItems.forEach(item => {
      fontFrequency[item.fontName] = (fontFrequency[item.fontName] || 0) + 1;
      totalFontSize += item.fontSize;
    });

    avgFontSize = totalFontSize / overlappingItems.length;
    primaryFont = Object.keys(fontFrequency).reduce((a, b) =>
      fontFrequency[a] > fontFrequency[b] ? a : b
    );
  }

  return {
    text: extractedText,
    fontFamily: primaryFont,
    fontSize: Math.round(avgFontSize * 10) / 10
  };
}

/**
 * Render and crop the selection area directly from the PDF page at a high scale factor for crystal clear resolution.
 * @param {pdfjsLib.PDFPageProxy} pageObj 
 * @param {{x1: number, y1: number, x2: number, y2: number}} rect - Normalized coordinates (0-1)
 * @param {number} renderScale - Scale factor to render at (default 3.0 for High DPI)
 * @returns {Promise<{dataUrl: string, blob: Blob} | null>}
 */
export async function cropCanvasRegion(pageObj, rect, renderScale = 3.0) {
  // Get viewport at the high resolution scale
  const viewport = pageObj.getViewport({ scale: renderScale });

  const minX = Math.min(rect.x1, rect.x2) * viewport.width;
  const maxX = Math.max(rect.x1, rect.x2) * viewport.width;
  const minY = Math.min(rect.y1, rect.y2) * viewport.height;
  const maxY = Math.max(rect.y1, rect.y2) * viewport.height;

  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);

  if (width <= 0 || height <= 0) return null;

  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = viewport.width;
  offscreenCanvas.height = viewport.height;

  const context = offscreenCanvas.getContext('2d');
  
  const renderContext = {
    canvasContext: context,
    viewport: viewport
  };

  await pageObj.render(renderContext).promise;

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = width;
  cropCanvas.height = height;
  const cropContext = cropCanvas.getContext('2d');

  cropContext.drawImage(
    offscreenCanvas,
    minX, minY, width, height,
    0, 0, width, height
  );

  return new Promise((resolve) => {
    cropCanvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve({
        dataUrl: cropCanvas.toDataURL('image/png'),
        blob: blob
      });
    }, 'image/png');
  });
}
