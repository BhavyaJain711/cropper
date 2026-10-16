import JSZip from 'jszip';

/**
 * Parses a single ZIP file containing Cropper extractions.
 * Reads manifest.json and loads all associated image files as Blobs/Data URLs.
 * @param {File} file 
 * @returns {Promise<Object>} Object containing filename, manifest entries, and image files mapped by path
 */
export async function parseExtractionZip(file) {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);
  
  // Find manifest.json
  const manifestFile = loadedZip.file('manifest.json');
  if (!manifestFile) {
    throw new Error(`Invalid zip file: "manifest.json" not found in ${file.name}`);
  }
  
  const manifestText = await manifestFile.async('text');
  const manifest = JSON.parse(manifestText);
  
  if (!Array.isArray(manifest)) {
    throw new Error(`Invalid manifest format in ${file.name}: expected an array.`);
  }

  const entries = [];
  
  // Process each entry in the manifest
  for (const item of manifest) {
    const imagePath = item.imageFile;
    let imageBlob = null;
    let imageDataUrl = null;
    
    if (imagePath) {
      const imgFile = loadedZip.file(imagePath);
      if (imgFile) {
        imageBlob = await imgFile.async('blob');
        
        // Convert to data URL for easy display in previews
        imageDataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(imageBlob);
        });
      }
    }
    
    entries.push({
      ...item,
      imageBlob,
      imageDataUrl,
      zipName: file.name
    });
  }
  
  return {
    fileName: file.name,
    entries
  };
}

/**
 * Extracts the top Y coordinate (position) of an extraction entry or selection.
 * @param {Object} entry 
 * @returns {number}
 */
export function getEntryY(entry) {
  if (!entry) return 0;
  const rect = entry.rect;
  if (rect) {
    if (typeof rect.y1 === 'number' && typeof rect.y2 === 'number') {
      return Math.min(rect.y1, rect.y2);
    }
    if (typeof rect.y1 === 'number') return rect.y1;
    if (typeof rect.y === 'number') return rect.y;
    if (typeof rect.top === 'number') return rect.top;
  }
  if (typeof entry.y1 === 'number') return entry.y1;
  if (typeof entry.y === 'number') return entry.y;
  return 0;
}

/**
 * Extracts the page number of an extraction entry or selection as an integer.
 * @param {Object} entry 
 * @returns {number}
 */
export function getEntryPage(entry) {
  if (!entry) return 0;
  const p = parseInt(entry.page, 10);
  return isNaN(p) ? 0 : p;
}

/**
 * Compares two entries ascending by page number, then ascending by top Y position (y-axis).
 * @param {Object} a 
 * @param {Object} b 
 * @returns {number}
 */
export function compareEntriesByPageAndY(a, b) {
  const pageA = getEntryPage(a);
  const pageB = getEntryPage(b);
  if (pageA !== pageB) {
    return pageA - pageB;
  }
  const yA = getEntryY(a);
  const yB = getEntryY(b);
  if (yA !== yB) {
    return yA - yB;
  }
  const xA = a?.rect ? Math.min(a.rect.x1 ?? 0, a.rect.x2 ?? 0) : (a?.x ?? 0);
  const xB = b?.rect ? Math.min(b.rect.x1 ?? 0, b.rect.x2 ?? 0) : (b?.x ?? 0);
  return xA - xB;
}

/**
 * Merges manifest entries from multiple parsed ZIP files.
 * Groups them by folder number, sorting entries by page number and y-axis position.
 * @param {Array<Object>} parsedZips 
 * @returns {Object} { folders: { [folderNum]: Array<Entry> }, allLabels: Array<string> }
 */
export function mergeManifests(parsedZips) {
  const folders = {};
  const labelsSet = new Set();
  
  for (const parsedZip of parsedZips) {
    for (const entry of parsedZip.entries) {
      const folderNum = String(entry.folder || '0').trim();
      const label = String(entry.label || 'extract').trim();
      
      labelsSet.add(label);
      
      if (!folders[folderNum]) {
        folders[folderNum] = [];
      }
      
      folders[folderNum].push(entry);
    }
  }
  
  // Sort entries within each folder by page number ascending, then y-axis ascending
  for (const folderNum in folders) {
    folders[folderNum].sort(compareEntriesByPageAndY);
  }

  return {
    folders,
    allLabels: Array.from(labelsSet)
  };
}

/**
 * Stable-sorts folder entries based on a specified label order.
 * Maintains page number & y-axis position ordering for duplicate folder+label pairs.
 * @param {Array<Object>} entries 
 * @param {Array<string>} labelOrder 
 * @returns {Array<Object>} Sorted entries
 */
export function sortEntriesByLabelOrder(entries, labelOrder, separateLabelsByZip = false) {
  if (!entries) return [];
  
  // Create a map of label -> rank (index in labelOrder)
  const labelRanks = {};
  labelOrder.forEach((lbl, idx) => {
    labelRanks[lbl] = idx;
  });
  
  // We perform a sort using label rank, falling back to page number & y-axis position
  return [...entries]
    .map((entry, originalIdx) => ({ entry, originalIdx }))
    .sort((a, b) => {
      const keyA = separateLabelsByZip ? `${a.entry.label} | ${a.entry.zipName}` : a.entry.label;
      const keyB = separateLabelsByZip ? `${b.entry.label} | ${b.entry.zipName}` : b.entry.label;
      
      const rankA = labelRanks[keyA] !== undefined ? labelRanks[keyA] : Infinity;
      const rankB = labelRanks[keyB] !== undefined ? labelRanks[keyB] : Infinity;
      
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      const pageComp = compareEntriesByPageAndY(a.entry, b.entry);
      if (pageComp !== 0) {
        return pageComp;
      }
      return a.originalIdx - b.originalIdx;
    })
    .map(wrapper => wrapper.entry);
}
