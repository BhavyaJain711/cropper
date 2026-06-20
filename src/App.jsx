import { useState, useEffect, useCallback } from 'react';
import Toolbar from './components/Toolbar';
import PDFViewer from './components/PDFViewer';
import SelectionsList from './components/SelectionsList';
import HelpModal from './components/HelpModal';
import { loadPDF, extractTextInRegion, cropCanvasRegion } from './utils/pdfUtils';
import { exportZip } from './utils/exportZip';
import { saveSessionMetadata, addOrUpdateSelectionInDB, deleteSelectionFromDB, getSession, deleteSession, getAllSessions, clearAllSessions, importAllSessions } from './utils/db';
import './App.css';

// Utility to convert DataURL to Blob
function dataURLtoBlob(dataurl) {
  if (!dataurl) return null;
  try {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (err) {
    console.error("Error converting DataURL to Blob:", err);
    return null;
  }
}

// Parse URL query parameters to retrieve custom labels
function getInitialLabelOptions() {
  const defaultLabels = [
    'Title',
    'Subtitle',
    'Body',
    'Table',
    'Image',
    'Header',
    'Footer'
  ];
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const labelsParam = searchParams.get('labels') || searchParams.get('params');
    if (labelsParam) {
      const trimmed = labelsParam.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            const clean = parsed.map(s => String(s).trim()).filter(Boolean);
            if (clean.length > 0) return clean;
          }
        } catch (e) {
          // Fallback to comma split if JSON parse fails
        }
      }
      const splitLabels = trimmed.split(',').map(s => s.trim()).filter(Boolean);
      if (splitLabels.length > 0) {
        return splitLabels;
      }
    }
  } catch (err) {
    console.error("Error parsing URL parameters for labels:", err);
  }
  return defaultLabels;
}

export default function App() {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [fileName, setFileName] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentNumber, setCurrentNumber] = useState(1);
  const [labelOptions, setLabelOptions] = useState(() => getInitialLabelOptions());
  const [currentLabel, setCurrentLabel] = useState(() => {
    const initial = getInitialLabelOptions();
    return initial.length > 0 ? initial[0] : 'Title';
  });
  const [selections, setSelections] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Undo/Redo history stacks
  const [history, setHistory] = useState([[]]);
  const [historyPointer, setHistoryPointer] = useState(0);

  // List of all saved sessions in IndexedDB
  const [savedSessionsList, setSavedSessionsList] = useState({});

  // Load sessions from IndexedDB on component mount
  useEffect(() => {
    async function loadSessions() {
      try {
        const sessions = await getAllSessions();
        setSavedSessionsList(sessions || {});
      } catch (err) {
        console.error('Error loading sessions from IndexedDB:', err);
      }
    }
    loadSessions();
  }, []);

  // Help guide modal state
  const [showHelp, setShowHelp] = useState(false);

  const updateSelectionsWithHistory = (newSelections) => {
    setSelections(newSelections);
    const newHistory = history.slice(0, historyPointer + 1);
    setHistory([...newHistory, newSelections]);
    setHistoryPointer(newHistory.length);
  };

  const initHistory = (initialSelections) => {
    setHistory([initialSelections]);
    setHistoryPointer(0);
  };

  const handleUndo = useCallback(() => {
    if (historyPointer > 0) {
      const prevPointer = historyPointer - 1;
      setHistoryPointer(prevPointer);
      setSelections(history[prevPointer]);
    }
  }, [historyPointer, history]);

  const handleRedo = useCallback(() => {
    if (historyPointer < history.length - 1) {
      const nextPointer = historyPointer + 1;
      setHistoryPointer(nextPointer);
      setSelections(history[nextPointer]);
    }
  }, [historyPointer, history]);

  // Auto-save file metadata to IndexedDB when currentNumber or labelOptions changes
  useEffect(() => {
    if (!fileName) return;

    let isSubscribed = true;

    async function doSaveMetadata() {
      try {
        await saveSessionMetadata(fileName, {
          currentNumber,
          labelOptions,
          lastModified: new Date().toISOString()
        });
        if (isSubscribed) {
          const sessions = await getAllSessions();
          if (isSubscribed) {
            setSavedSessionsList(sessions || {});
          }
        }
      } catch (err) {
        console.error('Error saving metadata to IndexedDB:', err);
      }
    }

    doSaveMetadata();

    return () => {
      isSubscribed = false;
    };
  }, [fileName, currentNumber, labelOptions]);

  // Global keyboard listeners for Arrows and Undo/Redo
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const activeEl = document.activeElement;
      const isEditable = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable
      );
      if (isEditable) return;

      // Left and Right Arrows for page navigation
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentPage(prev => Math.max(1, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentPage(prev => pageCount > 0 ? Math.min(pageCount, prev + 1) : prev);
      }

      // Shift + ArrowUp / ArrowDown for changing folder group number
      if (e.key === 'ArrowUp' && e.shiftKey) {
        e.preventDefault();
        setCurrentNumber(prev => prev + 1);
      } else if (e.key === 'ArrowDown' && e.shiftKey) {
        e.preventDefault();
        setCurrentNumber(prev => Math.max(0, prev - 1));
      }
      // Regular ArrowUp / ArrowDown for label selection
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (labelOptions.length > 0) {
          const currentIndex = labelOptions.indexOf(currentLabel);
          const nextIndex = currentIndex === -1 
            ? labelOptions.length - 1 
            : (currentIndex - 1 + labelOptions.length) % labelOptions.length;
          setCurrentLabel(labelOptions[nextIndex]);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (labelOptions.length > 0) {
          const currentIndex = labelOptions.indexOf(currentLabel);
          const nextIndex = currentIndex === -1 
            ? 0 
            : (currentIndex + 1) % labelOptions.length;
          setCurrentLabel(labelOptions[nextIndex]);
        }
      }

      // Toggle help modal on '?' key
      if (e.key === '?') {
        e.preventDefault();
        setShowHelp(prev => !prev);
      }

      // Undo & Redo shortcuts
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      
      if (cmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [pageCount, currentLabel, labelOptions, historyPointer, history, handleUndo, handleRedo, setCurrentNumber]);

  // File loading handler
  const handleFileSelect = async (file) => {
    try {
      setIsProcessing(true);
      const doc = await loadPDF(file);
      
      // Load session if exists
      let savedSession = null;
      try {
        savedSession = await getSession(file.name);
      } catch (e) {
        console.error('Error loading session from IndexedDB:', e);
      }

      setPdfDoc(doc);
      setFileName(file.name);
      setPageCount(doc.numPages);
      setCurrentPage(1);

      if (savedSession) {
        const loadedSelections = (savedSession.selections || []).map(s => ({
          ...s,
          imageBlob: s.imageDataUrl ? dataURLtoBlob(s.imageDataUrl) : null
        }));
        setSelections(loadedSelections);
        setCurrentNumber(savedSession.currentNumber ?? 1);
        
        const searchParams = new URLSearchParams(window.location.search);
        const hasUrlParams = searchParams.has('labels') || searchParams.has('params');
        if (hasUrlParams) {
          const urlLabels = getInitialLabelOptions();
          setLabelOptions(urlLabels);
          if (urlLabels.length > 0 && !urlLabels.includes(currentLabel)) {
            setCurrentLabel(urlLabels[0]);
          }
        } else if (savedSession.labelOptions) {
          setLabelOptions(savedSession.labelOptions);
        }
        initHistory(loadedSelections);
      } else {
        setSelections([]);
        setCurrentNumber(1);
        
        const searchParams = new URLSearchParams(window.location.search);
        const hasUrlParams = searchParams.has('labels') || searchParams.has('params');
        if (hasUrlParams) {
          const urlLabels = getInitialLabelOptions();
          setLabelOptions(urlLabels);
          if (urlLabels.length > 0) {
            setCurrentLabel(urlLabels[0]);
          }
        }
        initHistory([]);
      }
      setIsProcessing(false);
    } catch (err) {
      console.error('Error loading PDF file:', err);
      alert('Error loading PDF file. Please ensure it is a valid PDF document.');
      setIsProcessing(false);
    }
  };

  // Add a newly defined custom label to the options list
  const handleAddLabel = (newLabel) => {
    if (newLabel && !labelOptions.includes(newLabel)) {
      setLabelOptions((prev) => [...prev, newLabel]);
    }
    setCurrentLabel(newLabel);
  };

  // Handle a click-to-select rectangle completion
  const handleSelectionComplete = async (rect, pageObj, viewport) => {
    try {
      setIsProcessing(true);

      // 1. Crop image from PDF page directly at high-res
      const crop = await cropCanvasRegion(pageObj, rect);
      
      // 2. Extract overlapping text & font style properties
      const textData = await extractTextInRegion(pageObj, rect, viewport);

      // Generate a unique selection ID
      const selectionId = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `sel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newSelection = {
        id: selectionId,
        page: currentPage,
        number: currentNumber,
        label: currentLabel,
        rect: rect,
        text: textData.text,
        fontFamily: textData.fontFamily,
        fontSize: textData.fontSize,
        imageBlob: crop ? crop.blob : null,
        imageDataUrl: crop ? crop.dataUrl : null
      };

      const updatedSelections = [...selections, newSelection];
      updateSelectionsWithHistory(updatedSelections);

      // Save new selection record to IndexedDB
      await addOrUpdateSelectionInDB(fileName, newSelection);
      const sessions = await getAllSessions();
      setSavedSessionsList(sessions || {});

      // Cycle to the next label option
      if (labelOptions.length > 0) {
        const currentIndex = labelOptions.indexOf(currentLabel);
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % labelOptions.length;
        setCurrentLabel(labelOptions[nextIndex]);
      }

      setIsProcessing(false);
    } catch (err) {
      console.error('Error processing selection crop:', err);
      setIsProcessing(false);
    }
  };

  const handleDeleteSelection = async (id) => {
    const updated = selections.filter((s) => s.id !== id);
    updateSelectionsWithHistory(updated);
    try {
      await deleteSelectionFromDB(id);
      const sessions = await getAllSessions();
      setSavedSessionsList(sessions || {});
    } catch (e) {
      console.error('Error deleting selection:', e);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all selections?')) {
      updateSelectionsWithHistory([]);
      try {
        for (const sel of selections) {
          await deleteSelectionFromDB(sel.id);
        }
        const sessions = await getAllSessions();
        setSavedSessionsList(sessions || {});
      } catch (e) {
        console.error('Error clearing selections:', e);
      }
    }
  };

  // Edit selection properties
  const handleUpdateSelection = async (id, updatedFields) => {
    const updated = selections.map((s) => (s.id === id ? { ...s, ...updatedFields } : s));
    updateSelectionsWithHistory(updated);
    const updatedSel = updated.find((s) => s.id === id);
    if (updatedSel) {
      try {
        await addOrUpdateSelectionInDB(fileName, updatedSel);
        const sessions = await getAllSessions();
        setSavedSessionsList(sessions || {});
      } catch (e) {
        console.error('Error updating selection:', e);
      }
    }
  };

  // Re-crop and run OCR when coordinate rect changes
  const handleSelectionUpdateRect = async (id, rect, pageObj, viewport) => {
    try {
      setIsProcessing(true);

      // 1. Crop image from PDF page directly at high-res
      const crop = await cropCanvasRegion(pageObj, rect);
      
      // 2. Extract overlapping text & font style properties
      const textData = await extractTextInRegion(pageObj, rect, viewport);

      const updatedFields = {
        rect: rect,
        text: textData.text,
        fontFamily: textData.fontFamily,
        fontSize: textData.fontSize,
        imageBlob: crop ? crop.blob : null,
        imageDataUrl: crop ? crop.dataUrl : null
      };

      const updated = selections.map((s) => (s.id === id ? { ...s, ...updatedFields } : s));
      updateSelectionsWithHistory(updated);

      const updatedSel = updated.find((s) => s.id === id);
      if (updatedSel) {
        await addOrUpdateSelectionInDB(fileName, updatedSel);
        const sessions = await getAllSessions();
        setSavedSessionsList(sessions || {});
      }

      setIsProcessing(false);
    } catch (err) {
      console.error('Error updating selection crop:', err);
      setIsProcessing(false);
    }
  };

  // Load a saved project session
  const handleLoadSession = (sessionFileName, sessionData) => {
    const loadedSelections = (sessionData.selections || []).map(s => ({
      ...s,
      imageBlob: s.imageDataUrl ? dataURLtoBlob(s.imageDataUrl) : null
    }));
    
    setFileName(sessionFileName);
    setSelections(loadedSelections);
    setCurrentNumber(sessionData.currentNumber ?? 1);
    
    const searchParams = new URLSearchParams(window.location.search);
    const hasUrlParams = searchParams.has('labels') || searchParams.has('params');
    if (hasUrlParams) {
      const urlLabels = getInitialLabelOptions();
      setLabelOptions(urlLabels);
      if (urlLabels.length > 0 && !urlLabels.includes(currentLabel)) {
        setCurrentLabel(urlLabels[0]);
      }
    } else if (sessionData.labelOptions) {
      setLabelOptions(sessionData.labelOptions);
    }
    
    initHistory(loadedSelections);

    if (pdfDoc && fileName !== sessionFileName) {
      setPdfDoc(null);
      setPageCount(0);
      setCurrentPage(1);
    }
  };

  // Delete a saved session
  const handleDeleteSession = async (nameToDelete) => {
    if (window.confirm(`Are you sure you want to delete the saved session for "${nameToDelete}"?`)) {
      try {
        await deleteSession(nameToDelete);
        const sessions = await getAllSessions();
        setSavedSessionsList(sessions || {});

        if (nameToDelete === fileName) {
          setSelections([]);
          initHistory([]);
        }
      } catch (e) {
        console.error('Error deleting session from IndexedDB:', e);
      }
    }
  };

  const handleClearAllSessions = async () => {
    if (window.confirm('Are you sure you want to delete all saved sessions? This cannot be undone.')) {
      try {
        await clearAllSessions();
        setSavedSessionsList({});
        setSelections([]);
        initHistory([]);
      } catch (e) {
        console.error('Error clearing sessions from IndexedDB:', e);
      }
    }
  };

  const handleExportSessionsJSON = async () => {
    try {
      const sessions = await getAllSessions();
      if (!sessions || Object.keys(sessions).length === 0) {
        alert('No saved sessions to export.');
        return;
      }
      const raw = JSON.stringify(sessions);
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cropper_sessions_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error exporting sessions from IndexedDB:', e);
      alert('Error exporting sessions.');
    }
  };

  const handleImportSessionsJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (typeof imported !== 'object' || imported === null) {
          throw new Error('Invalid format');
        }

        for (const key of Object.keys(imported)) {
          if (imported[key] && !Array.isArray(imported[key].selections)) {
            throw new Error(`Session "${key}" is missing a valid selections array.`);
          }
        }

        const currentSessions = await getAllSessions();
        const merged = { ...currentSessions, ...imported };
        
        await importAllSessions(merged);
        setSavedSessionsList(merged);

        if (fileName && merged[fileName]) {
          const loadedSelections = (merged[fileName].selections || []).map(s => ({
            ...s,
            imageBlob: s.imageDataUrl ? dataURLtoBlob(s.imageDataUrl) : null
          }));
          setSelections(loadedSelections);
          setCurrentNumber(merged[fileName].currentNumber ?? 1);
          
          const searchParams = new URLSearchParams(window.location.search);
          const hasUrlParams = searchParams.has('labels') || searchParams.has('params');
          if (hasUrlParams) {
            const urlLabels = getInitialLabelOptions();
            setLabelOptions(urlLabels);
            if (urlLabels.length > 0 && !urlLabels.includes(currentLabel)) {
              setCurrentLabel(urlLabels[0]);
            }
          } else if (merged[fileName].labelOptions) {
            setLabelOptions(merged[fileName].labelOptions);
          }
          
          initHistory(loadedSelections);
        }

        alert('Backup imported successfully!');
      } catch (err) {
        console.error(err);
        alert('Failed to import backup. Details: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportZip = async () => {
    try {
      setIsProcessing(true);
      await exportZip(selections, fileName);
      setIsProcessing(false);
    } catch (err) {
      console.error('Error during ZIP creation:', err);
      alert('Failed to generate ZIP archive: ' + err.message);
      setIsProcessing(false);
    }
  };

  const handleJumpToPage = (pageNum) => {
    if (pageNum >= 1 && pageNum <= pageCount) {
      setCurrentPage(pageNum);
    }
  };

  return (
    <div className="app-container">
      {isProcessing && (
        <div className="processing-overlay">
          <div className="processing-dialog">
            <div className="spinner"></div>
            <span>Processing...</span>
          </div>
        </div>
      )}

      {/* App Header */}
      <header className="app-header">
        <div className="logo-container">
          <div className="app-logo">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="19" x2="15" y2="19"/><line x1="9" y1="11" x2="10" y2="11"/></svg>
          </div>
          <h1>Cropper Studio</h1>
          <span className="app-tag">PDF Area Extractor</span>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="app-workspace">
        <div className="workspace-main">
          <Toolbar
            onFileSelect={handleFileSelect}
            fileName={fileName}
            pageCount={pageCount}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            currentNumber={currentNumber}
            onNumberChange={setCurrentNumber}
            currentLabel={currentLabel}
            onLabelChange={setCurrentLabel}
            labelOptions={labelOptions}
            onAddLabel={handleAddLabel}
            onExportZip={handleExportZip}
            hasSelections={selections.length}
            
            // Undo/Redo props
            canUndo={historyPointer > 0}
            canRedo={historyPointer < history.length - 1}
            onUndo={handleUndo}
            onRedo={handleRedo}

            // Help guide prop
            onToggleHelp={() => setShowHelp(prev => !prev)}
          />

          <div className="pdf-viewer-outer">
            <PDFViewer
              pdfDoc={pdfDoc}
              currentPage={currentPage}
              selections={selections}
              onSelectionComplete={handleSelectionComplete}
              onDeleteSelection={handleDeleteSelection}
              onSelectionUpdateRect={handleSelectionUpdateRect}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>

        {/* Sidebar Selections Manager */}
        <SelectionsList
          selections={selections}
          onDeleteSelection={handleDeleteSelection}
          onJumpToPage={handleJumpToPage}
          onClearAll={handleClearAll}
          onUpdateSelection={handleUpdateSelection}
          labelOptions={labelOptions}
          
          // Sessions List props
          activeFileName={fileName}
          savedSessionsList={savedSessionsList}
          onLoadSession={handleLoadSession}
          onDeleteSession={handleDeleteSession}
          onClearAllSessions={handleClearAllSessions}
          onExportSessionsJSON={handleExportSessionsJSON}
          onImportSessionsJSON={handleImportSessionsJSON}
        />
      </div>

      {/* Help Modal Guide */}
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
