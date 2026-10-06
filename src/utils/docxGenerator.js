import { Document, Packer, Paragraph, TextRun, ImageRun, PageBreak, AlignmentType, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';
import { sortEntriesByLabelOrder } from './zipParser';

/**
 * Loads image dimensions from a Data URL or Blob URL.
 * @param {string} dataUrl 
 * @returns {Promise<{width: number, height: number}>}
 */
function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 500, height: img.naturalHeight || 200 });
    };
    img.onerror = () => {
      resolve({ width: 500, height: 200 }); // fallback
    };
    img.src = dataUrl;
  });
}

/**
 * Converts a Data URL (base64) string to a Uint8Array for docx ImageRun.
 * @param {string} dataUrl 
 * @returns {Uint8Array}
 */
function dataUrlToUint8Array(dataUrl) {
  if (!dataUrl) return new Uint8Array();
  const parts = dataUrl.split(',');
  const base64 = parts[1] || parts[0];
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts a Blob to a Uint8Array for docx ImageRun.
 * @param {Blob} blob 
 * @returns {Promise<Uint8Array>}
 */
async function blobToUint8Array(blob) {
  if (!blob) return new Uint8Array();
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Generates an assembled Word Document (.docx) from merged extraction folders.
 * @param {Object} folders - Merged folders { [folderNum]: Array<Entry> }
 * @param {Array<string>} labelOrder - User-defined label order
 * @param {Object} options - Formatting options
 * @returns {Promise<Blob>} Word document blob
 */
export async function generateAssembledDOCX(folders, labelOrder, options = {}) {
  const {
    pageSize = 'a4',
    margin = 15, // in mm
    pageBreakPerFolder = false,
    showHeaders = true,
    headerFontSize = 12,
    imageGap = 6,
    showLabels = true,
    sizeMode = 'original',
    imageScale = 100,
    separateLabelsByZip = false
  } = options;

  // Convert mm to twips for docx page setup (1 mm = 56.7 twips)
  const mmToTwips = 56.7;
  const marginTwips = Math.round(margin * mmToTwips);

  const pageDimensions = {
    a4: { width: 11906, height: 16838, contentWidthPx: 600 },
    letter: { width: 12240, height: 15840, contentWidthPx: 620 },
    legal: { width: 12240, height: 20160, contentWidthPx: 620 }
  };

  const dim = pageDimensions[pageSize] || pageDimensions.a4;
  const maxContentWidthPx = dim.contentWidthPx;

  // Sort folder numbers numerically
  const folderNums = Object.keys(folders).sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b);
  });

  const children = [];
  let isFirstFolder = true;

  for (const folderNum of folderNums) {
    const sortedEntries = sortEntriesByLabelOrder(folders[folderNum], labelOrder, separateLabelsByZip);
    if (!sortedEntries || sortedEntries.length === 0) continue;

    // Page break per folder
    if (pageBreakPerFolder && !isFirstFolder) {
      children.push(
        new Paragraph({
          children: [new PageBreak()]
        })
      );
    } else if (!isFirstFolder && !pageBreakPerFolder) {
      // Visual spacing between folders
      children.push(
        new Paragraph({
          spacing: { before: 240, after: 120 }
        })
      );
    }

    isFirstFolder = false;

    // Folder Header
    if (showHeaders) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Folder: ${folderNum}`,
              bold: true,
              size: Math.round(headerFontSize * 2), // docx size is in half-points
              color: '8B5CF6'
            })
          ],
          border: {
            bottom: {
              color: 'E5E7EB',
              space: 4,
              value: BorderStyle.SINGLE,
              size: 6
            }
          },
          spacing: { before: 200, after: 140 }
        })
      );
    }

    // Process entries in folder
    for (const entry of sortedEntries) {
      if (!entry.imageDataUrl) continue;

      // Label Tag
      if (showLabels && entry.label) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `[${entry.label.toUpperCase()}]`,
                color: '6B7280',
                size: 18, // 9pt
                bold: true
              })
            ],
            spacing: { before: 120, after: 60 }
          })
        );
      }

      // Calculate Image Dimensions
      const dims = await getImageDimensions(entry.imageDataUrl);
      let baseWidth = dims.width * 0.75; // 96 dpi base px
      let baseHeight = dims.height * 0.75;

      if (sizeMode === 'fitWidth') {
        baseWidth = maxContentWidthPx;
        baseHeight = (dims.height / dims.width) * maxContentWidthPx;
      }

      // Apply image scaling
      let imgWidth = baseWidth * (imageScale / 100);
      let imgHeight = baseHeight * (imageScale / 100);

      // Constrain max width to fit page
      if (imgWidth > maxContentWidthPx) {
        const ratio = imgWidth / imgHeight;
        imgWidth = maxContentWidthPx;
        imgHeight = maxContentWidthPx / ratio;
      }

      const uint8Data = dataUrlToUint8Array(entry.imageDataUrl);
      const imageType = entry.imageDataUrl.includes('image/jpeg') || entry.imageDataUrl.includes('image/jpg') ? 'jpg' : 'png';

      // Gap spacing in twips
      const afterSpacing = Math.round(imageGap * 56.7);

      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: uint8Data,
              transformation: {
                width: Math.round(imgWidth),
                height: Math.round(imgHeight)
              },
              type: imageType
            })
          ],
          spacing: { before: 40, after: afterSpacing },
          alignment: AlignmentType.CENTER
        })
      );

      // If entry contains text notes or extracted OCR text, add it as editable text paragraph
      if (entry.text && entry.text.trim()) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: entry.text.trim(),
                size: 20, // 10pt
                color: '1F2937'
              })
            ],
            spacing: { before: 40, after: 120 }
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: dim.width,
              height: dim.height
            },
            margin: {
              top: marginTwips,
              bottom: marginTwips,
              left: marginTwips,
              right: marginTwips
            }
          }
        },
        children
      }
    ]
  });

  return await Packer.toBlob(doc);
}

/**
 * Generates and downloads a Word Document (.docx) of crop selections directly from main view.
 * @param {Array<Object>} selections - Array of selection objects
 * @param {string} pdfName - Original PDF filename
 */
export async function exportSelectionsDOCX(selections, pdfName = 'selections') {
  if (!selections || selections.length === 0) {
    throw new Error('No selections to export');
  }

  // Group selections by folder number
  const grouped = {};
  for (const sel of selections) {
    const num = String(sel.number || 0).trim() || '0';
    if (!grouped[num]) grouped[num] = [];
    grouped[num].push(sel);
  }

  const sortedFolderNums = Object.keys(grouped).sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });

  const children = [];
  let isFirstFolder = true;

  for (const folderNum of sortedFolderNums) {
    const folderItems = grouped[folderNum];

    if (!isFirstFolder) {
      children.push(
        new Paragraph({
          children: [new PageBreak()]
        })
      );
    }
    isFirstFolder = false;

    // Folder Header
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Folder: ${folderNum}`,
            bold: true,
            size: 28, // 14pt
            color: '8B5CF6'
          })
        ],
        border: {
          bottom: {
            color: 'E5E7EB',
            space: 4,
            value: BorderStyle.SINGLE,
            size: 6
          }
        },
        spacing: { before: 200, after: 160 }
      })
    );

    for (const item of folderItems) {
      // Label Tag
      if (item.label) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `[${item.label.toUpperCase()}]`,
                color: '6B7280',
                size: 18, // 9pt
                bold: true
              })
            ],
            spacing: { before: 120, after: 60 }
          })
        );
      }

      // Image
      if (item.imageBlob || item.imageDataUrl) {
        let uint8Data;
        let dims = { width: 500, height: 200 };

        if (item.imageDataUrl) {
          dims = await getImageDimensions(item.imageDataUrl);
          uint8Data = dataUrlToUint8Array(item.imageDataUrl);
        } else if (item.imageBlob) {
          const objectUrl = URL.createObjectURL(item.imageBlob);
          dims = await getImageDimensions(objectUrl);
          URL.revokeObjectURL(objectUrl);
          uint8Data = await blobToUint8Array(item.imageBlob);
        }

        let baseWidth = dims.width * 0.75;
        let baseHeight = dims.height * 0.75;
        const maxContentWidthPx = 600;

        if (baseWidth > maxContentWidthPx) {
          const ratio = baseWidth / baseHeight;
          baseWidth = maxContentWidthPx;
          baseHeight = maxContentWidthPx / ratio;
        }

        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: uint8Data,
                transformation: {
                  width: Math.round(baseWidth),
                  height: Math.round(baseHeight)
                },
                type: 'png'
              })
            ],
            spacing: { before: 40, after: 160 },
            alignment: AlignmentType.CENTER
          })
        );
      }

      // Extracted text
      if (item.text && item.text.trim()) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.text.trim(),
                size: 20, // 10pt
                color: '1F2937'
              })
            ],
            spacing: { before: 40, after: 160 }
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 850, bottom: 850, left: 850, right: 850 }
          }
        },
        children
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  const cleanPdfName = pdfName.replace(/\.[^/.]+$/, "");
  saveAs(blob, `${cleanPdfName}_assembled.docx`);
}
