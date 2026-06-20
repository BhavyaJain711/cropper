import { useState, useRef, useEffect } from 'react';

export default function Toolbar({
  onFileSelect,
  fileName,
  pageCount,
  currentPage,
  onPageChange,
  currentNumber,
  onNumberChange,
  currentLabel,
  onLabelChange,
  labelOptions,
  onAddLabel,
  onExportZip,
  hasSelections,

  // Undo/Redo props
  canUndo,
  canRedo,
  onUndo,
  onRedo,

  // Help guide prop
  onToggleHelp
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [prevLabel, setPrevLabel] = useState(currentLabel);
  const [inputValue, setInputValue] = useState(currentLabel);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [filterText, setFilterText] = useState(null);
  const dropdownRef = useRef(null);

  // Sync internal input value when prop changes (recommended React pattern)
  if (currentLabel !== prevLabel) {
    setPrevLabel(currentLabel);
    setInputValue(currentLabel);
  }

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
        setFilterText(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter dropdown options based on what is typed (null filterText means show all options)
  const filteredOptions = filterText === null
    ? labelOptions
    : labelOptions.filter((opt) =>
        opt.toLowerCase().includes(filterText.toLowerCase())
      );

  // Sync highlightedIndex adjustments when inputs or dropdown opens
  const [prevInputValue, setPrevInputValue] = useState(inputValue);
  const [prevDropdownOpen, setPrevDropdownOpen] = useState(dropdownOpen);

  if (inputValue !== prevInputValue || dropdownOpen !== prevDropdownOpen) {
    setPrevInputValue(inputValue);
    setPrevDropdownOpen(dropdownOpen);
    setHighlightedIndex(-1);
  }

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    setFilterText(val);
    onLabelChange(val);
    setDropdownOpen(true);
  };

  const handleInputFocus = (e) => {
    setFilterText(null);
    setDropdownOpen(true);
    // Highlight the text for easier overwriting/searching
    e.target.select();
  };

  const selectOption = (opt) => {
    setInputValue(opt);
    onLabelChange(opt);
    setFilterText(null);
    setDropdownOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!dropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setFilterText(null);
        setDropdownOpen(true);
        e.preventDefault();
      }
      return;
    }

    const maxIndex = filteredOptions.length - 1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        selectOption(filteredOptions[highlightedIndex]);
      } else {
        const val = inputValue.trim();
        if (val && !labelOptions.includes(val)) {
          onAddLabel(val);
        }
        setFilterText(null);
        setDropdownOpen(false);
      }
      e.target.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setFilterText(null);
      setDropdownOpen(false);
    }
  };

  const handleAddLabelClick = () => {
    const val = inputValue.trim();
    if (val && !labelOptions.includes(val)) {
      onAddLabel(val);
    }
    setFilterText(null);
    setDropdownOpen(false);
  };

  return (
    <div className="toolbar" id="app-toolbar">
      {/* File Input */}
      <div className="toolbar-section">
        <label className="file-input-wrapper">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                onFileSelect(e.target.files[0]);
              }
            }}
          />
          <span className="btn btn-primary btn-file">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Open PDF
          </span>
        </label>
        {fileName && (
          <span className="file-name" title={fileName}>
            {fileName.length > 20 ? fileName.substring(0, 17) + '...' : fileName}
          </span>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-icon help-trigger-btn"
          onClick={onToggleHelp}
          title="Keyboard Shortcuts & Guide (?)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </button>
      </div>

      {fileName && (
        <>
          {/* Tagging Settings */}
          <div className="toolbar-section flex-grow">
            <div className="input-group">
              <label className="input-label" htmlFor="group-number">Folder #</label>
              <div className="number-adjuster">
                <button
                  type="button"
                  className="adjuster-btn"
                  onClick={() => onNumberChange(Math.max(0, currentNumber - 1))}
                  title="Decrement folder number (Shift+Down Arrow)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <input
                  id="group-number"
                  type="number"
                  min="0"
                  className="input-number"
                  value={currentNumber}
                  onChange={(e) => onNumberChange(parseInt(e.target.value, 10) || 0)}
                />
                <button
                  type="button"
                  className="adjuster-btn"
                  onClick={() => onNumberChange(currentNumber + 1)}
                  title="Increment folder number (Shift+Up Arrow)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              </div>
            </div>

            <div className="input-group dropdown-container" ref={dropdownRef}>
              <label className="input-label" htmlFor="label-select">File Label</label>
              <div className="combobox-wrapper">
                <input
                  id="label-select"
                  type="text"
                  placeholder="Select or type..."
                  className="input-text"
                  value={inputValue}
                  onChange={handleInputChange}
                  onFocus={handleInputFocus}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                />
                <button 
                  type="button" 
                  className="combobox-toggle"
                  onClick={() => {
                    if (!dropdownOpen) {
                      setFilterText(null);
                    }
                    setDropdownOpen(!dropdownOpen);
                  }}
                  aria-label="Toggle dropdown"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {dropdownOpen && (
                  <div className="custom-dropdown">
                    {filteredOptions.map((opt, index) => (
                      <div
                        key={opt}
                        className={`dropdown-option ${opt === currentLabel ? 'active' : ''} ${index === highlightedIndex ? 'highlighted' : ''}`}
                        onClick={() => selectOption(opt)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                      >
                        {opt}
                      </div>
                    ))}
                    {filterText !== null && filterText.trim() && !labelOptions.includes(filterText.trim()) && (
                      <div className="dropdown-option add-new" onClick={handleAddLabelClick}>
                        Create label: "<strong>{filterText.trim()}</strong>"
                      </div>
                    )}
                    {filteredOptions.length === 0 && (!filterText || !filterText.trim()) && (
                      <div className="dropdown-no-results">No labels found</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Page Controls */}
          {pageCount > 0 && (
            <div className="toolbar-section">
              <button
                className="btn btn-secondary btn-icon"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
                title="Previous page (Left Arrow)"
                id="btn-prev-page"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span className="page-indicator">
                Page <input 
                  type="number" 
                  min="1" 
                  max={pageCount} 
                  value={currentPage}
                  className="page-input"
                  onChange={(e) => {
                    const pageVal = parseInt(e.target.value, 10);
                    if (pageVal >= 1 && pageVal <= pageCount) {
                      onPageChange(pageVal);
                    }
                  }}
                /> / {pageCount}
              </span>
              <button
                className="btn btn-secondary btn-icon"
                disabled={currentPage >= pageCount}
                onClick={() => onPageChange(currentPage + 1)}
                title="Next page (Right Arrow)"
                id="btn-next-page"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          )}

          {/* Undo/Redo Controls */}
          <div className="toolbar-section">
            <button
              className="btn btn-secondary btn-icon"
              disabled={!canUndo}
              onClick={onUndo}
              title="Undo crop selection (Ctrl+Z)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
            </button>
            <button
              className="btn btn-secondary btn-icon"
              disabled={!canRedo}
              onClick={onRedo}
              title="Redo crop selection (Ctrl+Y)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
            </button>
          </div>

          {/* Export Action */}
          <div className="toolbar-section">
            <button
              className="btn btn-export"
              onClick={onExportZip}
              disabled={!hasSelections}
              title="Download structured ZIP file"
              id="btn-export-zip"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download ZIP ({hasSelections ? selectionsLengthCount(hasSelections) : 0})
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function selectionsLengthCount(val) {
  return typeof val === 'number' ? val : (Array.isArray(val) ? val.length : 0);
}
