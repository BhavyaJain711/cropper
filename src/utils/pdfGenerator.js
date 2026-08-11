import { jsPDF } from 'jspdf';
import { sortEntriesByLabelOrder } from './zipParser';

/**
 * Loads image dimensions from a Data URL.
 * @param {string} dataUrl 
 * @returns {Promise<{width: number, height: number}>}
 */
function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      resolve({ width: 500, height: 200 }); // fallback dimensions
    };
    img.src = dataUrl;
  });
}

/**
 * Generates an assembled PDF from merged extraction folders.
 * @param {Object} folders - Merged folders { [folderNum]: Array<Entry> }
 * @param {Array<string>} labelOrder - User-defined label order
 * @param {Object} options - PDF formatting options
 * @returns {Promise<Blob>}
 */
export async function generateAssembledPDF(folders, labelOrder, options = {}) {
  const {
    pageSize = 'a4', // 'a4', 'letter', 'legal'
    margin = 15, // in mm
    pageBreakPerFolder = false, // true = folder starts on new page
    showHeaders = true, // true = show "Folder XXXX" text
    headerFontSize = 12, // font size for folder header in pt
    imageGap = 6, // gap between images in mm
    showLabels = true, // true = draw [LABEL] above image
    sizeMode = 'original', // 'original' (keeps native size) | 'fitWidth' (scales to full width)
    imageScale = 100, // scale percentage (10% to 100%)
    separateLabelsByZip = false // treat labels from different ZIPs separately
  } = options;

  // Initialize jsPDF. Units are in millimeters
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: pageSize
  });

  // Page dimensions map
  const pageSizes = {
    a4: { width: 210, height: 297 },
    letter: { width: 215.9, height: 279.4 },
    legal: { width: 215.9, height: 355.6 }
  };

  const dimensions = pageSizes[pageSize] || pageSizes.a4;
  const pageWidth = dimensions.width;
  const pageHeight = dimensions.height;
  const contentWidth = pageWidth - (margin * 2);
  const maxContentHeight = pageHeight - (margin * 2);

  // Sort folder numbers numerically
  const folderNums = Object.keys(folders).sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b);
  });

  let isFirstPage = true;
  let currentY = margin;

  // Pre-load all entry image dimensions to avoid sync rendering lag
  const loadedEntries = [];
  for (const folderNum of folderNums) {
    const sortedEntries = sortEntriesByLabelOrder(folders[folderNum], labelOrder, separateLabelsByZip);
    
    const entriesWithDims = [];
    for (const entry of sortedEntries) {
      if (entry.imageDataUrl) {
        const dims = await getImageDimensions(entry.imageDataUrl);
        entriesWithDims.push({ ...entry, dims });
      }
    }
    
    if (entriesWithDims.length > 0) {
      loadedEntries.push({ folderNum, entries: entriesWithDims });
    }
  }

  for (const group of loadedEntries) {
    const { folderNum, entries } = group;

    // Handing page breaks between folders
    if (pageBreakPerFolder && !isFirstPage) {
      doc.addPage();
      currentY = margin;
    } else if (!isFirstPage && !pageBreakPerFolder) {
      // Add visual gap before new folder section
      currentY += 8;
    }

    isFirstPage = false;

    // Draw Folder Header
    if (showHeaders) {
      const headerHeight = headerFontSize * 0.35; // height of text in mm (roughly)
      const spaceRequired = headerHeight + 6;

      // Check space for folder header
      if (currentY + spaceRequired > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
      }
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(headerFontSize);
      doc.setTextColor(139, 92, 246); // Primary violet color theme
      doc.text(`Folder: ${folderNum}`, margin, currentY + headerHeight);
      
      // Draw a subtle line underneath the folder name
      doc.setDrawColor(42, 42, 64);
      doc.setLineWidth(0.3);
      doc.line(margin, currentY + headerHeight + 2, pageWidth - margin, currentY + headerHeight + 2);
      
      currentY += spaceRequired + 2;
    }

    // Process each image in the folder
    for (const entry of entries) {
      const { imageDataUrl, label, dims } = entry;
      
      // Determine base dimensions (original vs fit-width)
      const renderScale = 3.0;
      const pixelToMmFactor = (1 / renderScale) * (25.4 / 72);
      
      let baseWidth = dims.width * pixelToMmFactor;
      let baseHeight = dims.height * pixelToMmFactor;

      if (sizeMode === 'fitWidth') {
        baseWidth = contentWidth;
        baseHeight = (dims.height / dims.width) * contentWidth;
      }

      // Apply image scale setting
      let imgWidth = baseWidth * (imageScale / 100);
      let imgHeight = baseHeight * (imageScale / 100);

      // Define height allowance for label tag
      let labelOffset = 0;
      if (showLabels) {
        labelOffset = 6; // height allocated for label text
      }

      // Enforce width boundary constraint (never exceed content width)
      if (imgWidth > contentWidth) {
        const ratio = imgWidth / imgHeight;
        imgWidth = contentWidth;
        imgHeight = contentWidth / ratio;
      }

      // Enforce height boundary constraint (never exceed available height on a single page)
      const maxAvailableHeight = maxContentHeight - labelOffset;
      if (imgHeight > maxAvailableHeight) {
        const ratio = imgWidth / imgHeight;
        imgHeight = maxAvailableHeight;
        imgWidth = imgHeight * ratio;
      }

      // Now calculate the correct centered X coordinate based on final width
      const xPos = margin + (contentWidth - imgWidth) / 2;



      // Check if image (+ optional label) fits on the current page
      if (currentY + imgHeight + labelOffset > pageHeight - margin) {
        doc.addPage();
        currentY = margin;
      }

      if (showLabels) {
        // Draw label tag above the image for context
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(158, 160, 182); // Text secondary color
        doc.text(`[${label.toUpperCase()}]`, xPos, currentY + 4);
        currentY += labelOffset;
      }

      try {
        // Try to infer correct image format (PNG/JPEG)
        let format = 'PNG';
        if (imageDataUrl.startsWith('data:image/jpeg') || imageDataUrl.startsWith('data:image/jpg')) {
          format = 'JPEG';
        } else if (imageDataUrl.startsWith('data:image/webp')) {
          format = 'WEBP';
        }
        
        doc.addImage(imageDataUrl, format, xPos, currentY, imgWidth, imgHeight);
        currentY += imgHeight + imageGap; // custom visual gap between images
      } catch (err) {
        console.error('Error adding image to PDF:', err);
        // Draw placeholder text/rect on failure
        doc.setDrawColor(255, 0, 0);
        doc.rect(xPos, currentY, imgWidth, 15);
        doc.setFontSize(10);
        doc.setTextColor(255, 0, 0);
        doc.text(`Failed to render image (${label})`, xPos + 5, currentY + 10);
        currentY += 15 + imageGap;
      }
    }
  }

  // Add page numbers footer to all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(101, 103, 126); // Text tertiary color
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  return doc.output('blob');
}
