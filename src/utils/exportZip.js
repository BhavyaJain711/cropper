import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { compareEntriesByPageAndY } from './zipParser';
import { dataURLtoBlob } from './clipboardUtils';

/**
 * Generates and downloads a ZIP file of all cropped selections and metadata.
 * Selections are sorted by folder number, page number (ascending), and y-axis position (ascending).
 * @param {Array<Object>} selections - Array of selection objects
 * @param {string} pdfName - Original PDF filename (to base the ZIP name on)
 */
export async function exportZip(selections, pdfName = 'selections') {
  if (!selections || selections.length === 0) {
    throw new Error('No selections to export');
  }

  // Sort selections numerically by folder number, then ascending by page and y-axis position
  const sortedSelections = [...selections].sort((a, b) => {
    const numA = parseInt(a.number, 10);
    const numB = parseInt(b.number, 10);
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
      return numA - numB;
    }
    return compareEntriesByPageAndY(a, b);
  });

  const zip = new JSZip();
  
  // Track files in each folder to append indices (-2, -3, ...) for duplicates
  // Structure: { [folderNumber]: { [label]: count } }
  const fileCounters = {};
  
  // Array to hold index records for manifest.json
  const manifestData = [];

  for (const sel of sortedSelections) {
    const folderNum = String(sel.number || 0).trim() || '0';
    const labelName = String(sel.label || 'extract').trim() || 'extract';

    // Initialize counts for this folder and label
    if (!fileCounters[folderNum]) {
      fileCounters[folderNum] = {};
    }
    if (fileCounters[folderNum][labelName] === undefined) {
      fileCounters[folderNum][labelName] = 0;
    }

    fileCounters[folderNum][labelName]++;
    const count = fileCounters[folderNum][labelName];

    // Compute filename based on duplicate index
    const baseName = count === 1 ? labelName : `${labelName}-${count}`;
    const imagePath = `${folderNum}/${baseName}.png`;
    const jsonPath = `${folderNum}/${baseName}.json`;

    // 1. Add image to zip if it exists
    if (sel.imageBlob) {
      zip.file(imagePath, sel.imageBlob);
    } else if (sel.imageDataUrl) {
      const blob = dataURLtoBlob(sel.imageDataUrl);
      if (blob) {
        zip.file(imagePath, blob);
      }
    }


    // 2. Prepare selection metadata JSON
    const metadata = {
      id: sel.id,
      page: sel.page,
      folder: folderNum,
      label: labelName,
      rect: sel.rect,
      text: sel.text || '',
      styling: {
        fontFamily: sel.fontFamily || 'Normal',
        fontSize: sel.fontSize || 10
      }
    };

    // Add JSON file to ZIP
    zip.file(jsonPath, JSON.stringify(metadata, null, 2));

    // 3. Accumulate manifest data
    manifestData.push({
      ...metadata,
      imageFile: imagePath,
      jsonFile: jsonPath
    });
  }

  // Add manifest.json at the root of the ZIP
  zip.file('manifest.json', JSON.stringify(manifestData, null, 2));

  // Generate ZIP blob and trigger browser download
  const content = await zip.generateAsync({ type: 'blob' });
  const cleanPdfName = pdfName.replace(/\.[^/.]+$/, ""); // Strip extension
  saveAs(content, `${cleanPdfName}_extractions.zip`);
}
