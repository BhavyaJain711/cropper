const DB_NAME = 'CropperDB';
const DB_VERSION = 2;
const METADATA_STORE = 'sessions';
const SELECTIONS_STORE = 'selections';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      
      // Create metadata sessions store if not exists
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE);
      }
      
      // Create individual selections store with an index on fileName
      if (!db.objectStoreNames.contains(SELECTIONS_STORE)) {
        const selectionStore = db.createObjectStore(SELECTIONS_STORE, { keyPath: 'id' });
        selectionStore.createIndex('fileName', 'fileName', { unique: false });
      } else {
        const store = request.transaction.objectStore(SELECTIONS_STORE);
        if (!store.indexNames.contains('fileName')) {
          store.createIndex('fileName', 'fileName', { unique: false });
        }
      }
    };

    request.onsuccess = (e) => {
      resolve(e.target.result);
    };

    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

/**
 * Save PDF document metadata properties.
 * @param {string} fileName 
 * @param {object} metadata 
 */
export async function saveSessionMetadata(fileName, metadata) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(METADATA_STORE, 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.put({
      fileName,
      currentNumber: metadata.currentNumber,
      labelOptions: metadata.labelOptions,
      lastModified: metadata.lastModified || new Date().toISOString()
    }, fileName);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Insert or update a single selection row.
 * @param {string} fileName 
 * @param {object} selection 
 */
export async function addOrUpdateSelectionInDB(fileName, selection) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SELECTIONS_STORE, 'readwrite');
    const store = transaction.objectStore(SELECTIONS_STORE);
    
    // Strip heavy binary imageBlob to save space
    const cleanSelection = { ...selection, fileName };
    delete cleanSelection.imageBlob;

    const request = store.put(cleanSelection);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a single selection by selection ID.
 * @param {string} id 
 */
export async function deleteSelectionFromDB(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SELECTIONS_STORE, 'readwrite');
    const store = transaction.objectStore(SELECTIONS_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve the reconstructed session (metadata + selections list) for a PDF.
 * @param {string} fileName 
 * @returns {Promise<object|null>}
 */
export async function getSession(fileName) {
  const db = await openDB();
  
  const metadataPromise = new Promise((resolve, reject) => {
    const transaction = db.transaction(METADATA_STORE, 'readonly');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.get(fileName);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });

  const selectionsPromise = new Promise((resolve, reject) => {
    const transaction = db.transaction(SELECTIONS_STORE, 'readonly');
    const store = transaction.objectStore(SELECTIONS_STORE);
    const index = store.index('fileName');
    const request = index.getAll(fileName);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  const [metadata, selections] = await Promise.all([metadataPromise, selectionsPromise]);
  
  if (!metadata && selections.length === 0) {
    return null;
  }
  
  return {
    fileName,
    currentNumber: metadata?.currentNumber ?? 1,
    labelOptions: metadata?.labelOptions ?? [],
    lastModified: metadata?.lastModified || new Date().toISOString(),
    selections: selections
  };
}

/**
 * Delete metadata and all selections associated with a PDF file.
 * @param {string} fileName 
 */
export async function deleteSession(fileName) {
  const db = await openDB();
  
  // 1. Delete session metadata
  const deleteMeta = new Promise((resolve, reject) => {
    const transaction = db.transaction(METADATA_STORE, 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.delete(fileName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  // 2. Delete selections with matching fileName
  const deleteSelections = new Promise((resolve, reject) => {
    const transaction = db.transaction(SELECTIONS_STORE, 'readwrite');
    const store = transaction.objectStore(SELECTIONS_STORE);
    const index = store.index('fileName');
    const request = index.openCursor(IDBKeyRange.only(fileName));
    
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });

  await Promise.all([deleteMeta, deleteSelections]);
}

/**
 * Retrieve all saved sessions (for list display).
 * @returns {Promise<object>} Map of fileName to sessionData
 */
export async function getAllSessions() {
  const db = await openDB();
  
  const allMetadata = await new Promise((resolve, reject) => {
    const transaction = db.transaction(METADATA_STORE, 'readonly');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  const allSelections = await new Promise((resolve, reject) => {
    const transaction = db.transaction(SELECTIONS_STORE, 'readonly');
    const store = transaction.objectStore(SELECTIONS_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  // Group selections by fileName
  const selectionsByFile = {};
  allSelections.forEach(sel => {
    const fName = sel.fileName;
    if (fName) {
      if (!selectionsByFile[fName]) {
        selectionsByFile[fName] = [];
      }
      selectionsByFile[fName].push(sel);
    }
  });

  const result = {};
  allMetadata.forEach(meta => {
    const fName = meta.fileName;
    if (fName) {
      result[fName] = {
        currentNumber: meta.currentNumber ?? 1,
        labelOptions: meta.labelOptions || [],
        lastModified: meta.lastModified,
        selections: selectionsByFile[fName] || []
      };
    }
  });

  return result;
}

/**
 * Clear all tables.
 */
export async function clearAllSessions() {
  const db = await openDB();
  
  const clearMeta = new Promise((resolve, reject) => {
    const transaction = db.transaction(METADATA_STORE, 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  const clearSelections = new Promise((resolve, reject) => {
    const transaction = db.transaction(SELECTIONS_STORE, 'readwrite');
    const store = transaction.objectStore(SELECTIONS_STORE);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  await Promise.all([clearMeta, clearSelections]);
}

/**
 * Overwrite all databases with imported session lists.
 * @param {object} sessionsDict 
 */
export async function importAllSessions(sessionsDict) {
  const db = await openDB();
  
  // Clear first
  await clearAllSessions();
  
  const transactionMeta = db.transaction(METADATA_STORE, 'readwrite');
  const storeMeta = transactionMeta.objectStore(METADATA_STORE);
  
  const transactionSels = db.transaction(SELECTIONS_STORE, 'readwrite');
  const storeSels = transactionSels.objectStore(SELECTIONS_STORE);
  
  for (const [fileName, sessionData] of Object.entries(sessionsDict)) {
    storeMeta.put({
      fileName,
      currentNumber: sessionData.currentNumber ?? 1,
      labelOptions: sessionData.labelOptions || [],
      lastModified: sessionData.lastModified || new Date().toISOString()
    }, fileName);
    
    const selections = sessionData.selections || [];
    selections.forEach(sel => {
      const cleanSel = { ...sel, fileName };
      delete cleanSel.imageBlob;
      storeSels.put(cleanSel);
    });
  }
  
  const metaPromise = new Promise((resolve, reject) => {
    transactionMeta.oncomplete = () => resolve();
    transactionMeta.onerror = () => reject(transactionMeta.error);
  });
  
  const selsPromise = new Promise((resolve, reject) => {
    transactionSels.oncomplete = () => resolve();
    transactionSels.onerror = () => reject(transactionSels.error);
  });
  
  await Promise.all([metaPromise, selsPromise]);
}
