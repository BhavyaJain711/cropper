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
 * Merges manifest entries from multiple parsed ZIP files.
 * Groups them by folder number, keeping stable ordering for duplicate folder+label pairs.
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
  
  return {
    folders,
    allLabels: Array.from(labelsSet)
  };
}

/**
 * Stable-sorts folder entries based on a specified label order.
 * If a folder has multiple entries with the same label, it maintains their original relative order.
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
  
  // We perform a stable sort using the original array index as a fallback
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
      return a.originalIdx - b.originalIdx;
    })
    .map(wrapper => wrapper.entry);
}
