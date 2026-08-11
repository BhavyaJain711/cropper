import { useState, useMemo } from 'react';
import { parseExtractionZip, mergeManifests, sortEntriesByLabelOrder } from '../utils/zipParser';
import { generateAssembledPDF } from '../utils/pdfGenerator';

export default function Assembler() {
  const [uploadedZips, setUploadedZips] = useState([]); // [{ name, allLabels, entries: [...] }]
  const [isParsing, setIsParsing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // User ordered list of labels
  const [labelOrder, setLabelOrder] = useState([]);
  
  // PDF Options state
  const [pdfOptions, setPdfOptions] = useState({
    pageSize: 'a4',
    margin: 15,
    pageBreakPerFolder: false,
    showHeaders: true,
    headerFontSize: 12,
    imageGap: 6,
    showLabels: true,
    sizeMode: 'original',
    imageScale: 100,
    separateLabelsByZip: false
  });

  // Merge manifests from all uploaded ZIPs
  const { folders } = useMemo(() => {
    return mergeManifests(uploadedZips);
  }, [uploadedZips]);

  // Helper to update uploaded ZIPs
  const updateUploadedZipsAndLabels = (nextZips) => {
    setUploadedZips(nextZips);
  };

  // Helper to parse unique labels from uploaded ZIPs in combined or separate mode
  const getUniqueLabels = (zips, separate) => {
    const labelsSet = new Set();
    zips.forEach((zip) => {
      zip.labels.forEach((lbl) => {
        if (separate) {
          labelsSet.add(`${lbl} | ${zip.name}`);
        } else {
          labelsSet.add(lbl);
        }
      });
    });
    return Array.from(labelsSet);
  };

  // Declaratively synchronize labelOrder with uploadedZips and separateLabelsByZip
  const uniqueLabels = useMemo(
    () => getUniqueLabels(uploadedZips, pdfOptions.separateLabelsByZip),
    [uploadedZips, pdfOptions.separateLabelsByZip]
  );
  const [prevUniqueKey, setPrevUniqueKey] = useState('');
  const currentUniqueKey = uniqueLabels.join('|||');

  if (currentUniqueKey !== prevUniqueKey) {
    setPrevUniqueKey(currentUniqueKey);
    setLabelOrder((prev) => {
      const filtered = prev.filter((l) => uniqueLabels.includes(l));
      uniqueLabels.forEach((l) => {
        if (!filtered.includes(l)) {
          filtered.push(l);
        }
      });
      return filtered;
    });
  }

  // Handle files selection
  const handleZipFiles = async (files) => {
    if (!files || files.length === 0) return;
    setIsParsing(true);
    setErrorMsg('');
    
    const nextZips = [...uploadedZips];
    
    // Filter out duplicates (already uploaded with same name)
    const filesToParse = Array.from(files).filter(
      (file) => !nextZips.some((z) => z.name === file.name)
    );

    if (filesToParse.length === 0) {
      setIsParsing(false);
      return;
    }

    try {
      const results = await Promise.all(
        filesToParse.map(async (file) => {
          try {
            return await parseExtractionZip(file);
          } catch (err) {
            console.error(err);
            throw new Error(`Failed to parse "${file.name}": ${err.message}`, { cause: err });
          }
        })
      );
      
      results.forEach((res) => {
        const uniqueLabelsInZip = Array.from(new Set(res.entries.map((e) => e.label)));
        nextZips.push({
          name: res.fileName,
          entries: res.entries,
          labels: uniqueLabelsInZip
        });
      });
      
      updateUploadedZipsAndLabels(nextZips);
    } catch (err) {
      setErrorMsg(err.message || 'An error occurred while parsing zip files.');
    } finally {
      setIsParsing(false);
    }
  };

  // Drag over upload zone handler
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const handleDragOverFile = (e) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };
  const handleDragLeaveFile = () => {
    setIsDraggingFile(false);
  };
  const handleDropFile = (e) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files) {
      // Find only .zip files
      const zipFiles = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.endsWith('.zip')
      );
      if (zipFiles.length > 0) {
        handleZipFiles(zipFiles);
      } else {
        setErrorMsg('Only ZIP files (.zip) from Cropper extractions are supported.');
      }
    }
  };

  // Drag-and-drop label ordering sorting handlers
  const [draggedIndex, setDraggedIndex] = useState(null);

  const handleDragStart = (e, idx) => {
    setDraggedIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverLabel = (e, idx) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === idx) return;

    const nextOrder = [...labelOrder];
    const item = nextOrder.splice(draggedIndex, 1)[0];
    nextOrder.splice(idx, 0, item);
    setLabelOrder(nextOrder);
    setDraggedIndex(idx);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Delete a ZIP file from uploaded list
  const handleRemoveZip = (index) => {
    const updated = uploadedZips.filter((_, idx) => idx !== index);
    updateUploadedZipsAndLabels(updated);
  };

  // Clear all uploaded ZIPs
  const handleClearAll = () => {
    if (window.confirm('Clear all uploaded ZIP files?')) {
      updateUploadedZipsAndLabels([]);
    }
  };

  // Sorted folder list
  const sortedFolderKeys = useMemo(() => {
    return Object.keys(folders).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
  }, [folders]);

  // Generate and download the assembled PDF
  const handleGeneratePDF = async () => {
    if (sortedFolderKeys.length === 0) return;
    setIsGenerating(true);
    try {
      const pdfBlob = await generateAssembledPDF(folders, labelOrder, pdfOptions);
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `assembled_document_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Error generating PDF: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="assembler-container">
      {/* Upload Zone & Phase 1 */}
      <section className="assembler-section glass-panel">
        <div className="section-header">
          <div className="step-num">1</div>
          <h2>Upload Extractions ZIPs</h2>
        </div>
        
        <div 
          className={`upload-zone ${isDraggingFile ? 'dragover' : ''}`}
          onDragOver={handleDragOverFile}
          onDragLeave={handleDragLeaveFile}
          onDrop={handleDropFile}
          onClick={() => document.getElementById('zip-input-assembler').click()}
        >
          <input 
            type="file" 
            id="zip-input-assembler" 
            multiple 
            accept=".zip" 
            onChange={(e) => handleZipFiles(Array.from(e.target.files))}
            style={{ display: 'none' }}
          />
          <div className="upload-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <p className="upload-primary-text">Drag & drop multiple extraction ZIP files here</p>
          <p className="upload-secondary-text">or click to browse from device</p>
        </div>

        {errorMsg && <div className="error-banner">{errorMsg}</div>}
        {isParsing && (
          <div className="parsing-indicator">
            <div className="spinner-sm"></div>
            <span>Parsing uploaded ZIP structures...</span>
          </div>
        )}

        {uploadedZips.length > 0 && (
          <div className="uploaded-list-container">
            <div className="list-title-row">
              <h3>Uploaded Archives ({uploadedZips.length})</h3>
              <button className="btn-secondary btn-sm" onClick={handleClearAll}>
                Clear All
              </button>
            </div>
            <div className="zip-cards-grid">
              {uploadedZips.map((zip, idx) => (
                <div key={zip.name} className="zip-file-card">
                  <div className="zip-card-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                  </div>
                  <div className="zip-card-details">
                    <span className="zip-card-name" title={zip.name}>{zip.name}</span>
                    <span className="zip-card-meta">
                      {zip.entries.length} segments • {zip.labels.length} labels
                    </span>
                  </div>
                  <button 
                    className="zip-card-remove" 
                    onClick={(e) => { e.stopPropagation(); handleRemoveZip(idx); }}
                    title="Remove ZIP"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Phase 2: Define Label Ordering */}
      {uploadedZips.length > 0 && (
        <section className="assembler-section glass-panel">
          <div className="section-header">
            <div className="step-num">2</div>
            <h2>Define Label Sequence Order</h2>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
            <p className="section-desc" style={{ margin: 0, flex: 1, minWidth: '280px' }}>
              Drag the labels below to define the sequence order in which images should appear inside each folder row and the final PDF document.
            </p>
            <div className="settings-toggle-group" style={{ margin: 0, border: 'none', padding: 0 }}>
              <label className="toggle-switch-container">
                <input
                  type="checkbox"
                  checked={pdfOptions.separateLabelsByZip}
                  onChange={(e) => setPdfOptions(prev => ({ ...prev, separateLabelsByZip: e.target.checked }))}
                />
                <span className="toggle-slider"></span>
                <div className="toggle-label-details">
                  <span className="toggle-primary">Separate labels by ZIP</span>
                  <span className="toggle-secondary">Treat same label from different ZIPs separately</span>
                </div>
              </label>
            </div>
          </div>

          <div className="label-ordering-container">
            {labelOrder.length === 0 ? (
              <span className="empty-state-text">No labels found. Upload a ZIP file to discover labels.</span>
            ) : (
              <div className="label-chips-drag-list">
                {labelOrder.map((labelKey, idx) => {
                  const parts = labelKey.split(' | ');
                  const labelName = parts[0];
                  const zipName = parts[1];

                  return (
                    <div
                      key={labelKey}
                      className="draggable-label-chip"
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOverLabel(e, idx)}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="chip-drag-handle">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
                          <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
                        </svg>
                      </div>
                      <span className="chip-index">{idx + 1}</span>
                      <span className="chip-text">
                        <strong>{labelName}</strong>
                        {zipName && <span className="chip-zip-name"> ({zipName})</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Phase 3: Preview and PDF Generation */}
      {uploadedZips.length > 0 && (
        <section className="assembler-section glass-panel">
          <div className="section-header">
            <div className="step-num">3</div>
            <h2>Assembled Layout Preview & Generation</h2>
          </div>

          <div className="preview-and-options-layout">
            {/* Left Column: PDF Settings Panel */}
            <div className="pdf-settings-panel">
              <h3>PDF Styling & Settings</h3>
              
              <div className="settings-form-group">
                <label htmlFor="pdf-page-size">Page Size</label>
                <select
                  id="pdf-page-size"
                  value={pdfOptions.pageSize}
                  onChange={(e) => setPdfOptions(prev => ({ ...prev, pageSize: e.target.value }))}
                >
                  <option value="a4">A4 (210 x 297 mm)</option>
                  <option value="letter">Letter (215.9 x 279.4 mm)</option>
                  <option value="legal">Legal (215.9 x 355.6 mm)</option>
                </select>
              </div>

              <div className="settings-form-group">
                <label htmlFor="pdf-margin">Margins (mm)</label>
                <input
                  type="number"
                  id="pdf-margin"
                  min="0"
                  max="50"
                  value={pdfOptions.margin}
                  onChange={(e) => setPdfOptions(prev => ({ ...prev, margin: parseInt(e.target.value, 10) || 0 }))}
                />
              </div>

              <div className="settings-toggle-group">
                <label className="toggle-switch-container">
                  <input
                    type="checkbox"
                    checked={pdfOptions.pageBreakPerFolder}
                    onChange={(e) => setPdfOptions(prev => ({ ...prev, pageBreakPerFolder: e.target.checked }))}
                  />
                  <span className="toggle-slider"></span>
                  <div className="toggle-label-details">
                    <span className="toggle-primary">New page per folder</span>
                    <span className="toggle-secondary">Start each folder group on a clean sheet</span>
                  </div>
                </label>
              </div>



              <div className="settings-toggle-group">
                <label className="toggle-switch-container">
                  <input
                    type="checkbox"
                    checked={pdfOptions.separateLabelsByZip}
                    onChange={(e) => setPdfOptions(prev => ({ ...prev, separateLabelsByZip: e.target.checked }))}
                  />
                  <span className="toggle-slider"></span>
                  <div className="toggle-label-details">
                    <span className="toggle-primary">Separate labels by ZIP</span>
                    <span className="toggle-secondary">Treat same label from different ZIPs separately</span>
                  </div>
                </label>
              </div>

              <div className="settings-toggle-group">
                <label className="toggle-switch-container">
                  <input
                    type="checkbox"
                    checked={pdfOptions.showHeaders}
                    onChange={(e) => setPdfOptions(prev => ({ ...prev, showHeaders: e.target.checked }))}
                  />
                  <span className="toggle-slider"></span>
                  <div className="toggle-label-details">
                    <span className="toggle-primary">Show folder headers</span>
                    <span className="toggle-secondary">Draw folder boundaries in PDF</span>
                  </div>
                </label>
              </div>

              {pdfOptions.showHeaders && (
                <div className="settings-form-group" style={{ marginLeft: '12px', marginTop: '-8px', marginBottom: '16px' }}>
                  <label htmlFor="pdf-header-font-size">Header Font Size (pt)</label>
                  <input
                    type="number"
                    id="pdf-header-font-size"
                    min="6"
                    max="36"
                    value={pdfOptions.headerFontSize}
                    onChange={(e) => setPdfOptions(prev => ({ ...prev, headerFontSize: parseInt(e.target.value, 10) || 12 }))}
                  />
                </div>
              )}

              <div className="settings-toggle-group">
                <label className="toggle-switch-container">
                  <input
                    type="checkbox"
                    checked={pdfOptions.showLabels}
                    onChange={(e) => setPdfOptions(prev => ({ ...prev, showLabels: e.target.checked }))}
                  />
                  <span className="toggle-slider"></span>
                  <div className="toggle-label-details">
                    <span className="toggle-primary">Show segment labels</span>
                    <span className="toggle-secondary">Draw label tags above images</span>
                  </div>
                </label>
              </div>

              <div className="settings-form-group">
                <label htmlFor="pdf-image-gap">Gap Between Images (mm)</label>
                <input
                  type="number"
                  id="pdf-image-gap"
                  min="0"
                  max="50"
                  value={pdfOptions.imageGap}
                  onChange={(e) => setPdfOptions(prev => ({ ...prev, imageGap: parseInt(e.target.value, 10) ?? 0 }))}
                />
              </div>

              <div className="settings-form-group">
                <label htmlFor="pdf-size-mode">Image Size Mode</label>
                <select
                  id="pdf-size-mode"
                  value={pdfOptions.sizeMode}
                  onChange={(e) => setPdfOptions(prev => ({ ...prev, sizeMode: e.target.value }))}
                >
                  <option value="original">Original Size (Consistent Fonts)</option>
                  <option value="fitWidth">Scale to Fit Page Width</option>
                </select>
              </div>

              <div className="settings-form-group">
                <label htmlFor="pdf-image-scale">Image Scaling ({pdfOptions.imageScale}%)</label>
                <input
                  type="range"
                  id="pdf-image-scale"
                  min="10"
                  max="100"
                  step="5"
                  value={pdfOptions.imageScale}
                  onChange={(e) => setPdfOptions(prev => ({ ...prev, imageScale: parseInt(e.target.value, 10) || 100 }))}
                  style={{ cursor: 'pointer', width: '100%' }}
                />
              </div>



              <button
                className="btn-primary btn-lg btn-full-width"
                disabled={sortedFolderKeys.length === 0 || isGenerating}
                onClick={handleGeneratePDF}
              >
                {isGenerating ? (
                  <>
                    <div className="spinner-sm spinner-white"></div>
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                    </svg>
                    Assemble & Build PDF
                  </>
                )}
              </button>
            </div>

            {/* Right Column: Visual Preview Rows */}
            <div className="preview-display-panel">
              <div className="preview-panel-header">
                <h3>Assembled Folders Preview ({sortedFolderKeys.length})</h3>
                <span className="preview-count-meta">Sorted numerically</span>
              </div>

              <div className="preview-rows-container">
                {sortedFolderKeys.length === 0 ? (
                  <div className="empty-preview-state">
                    <span>No preview available. Upload zip archives above.</span>
                  </div>
                ) : (
                  sortedFolderKeys.map((folderNum) => {
                    const rawEntries = folders[folderNum] || [];
                    const sortedEntries = sortEntriesByLabelOrder(rawEntries, labelOrder, pdfOptions.separateLabelsByZip);

                    return (
                      <div key={folderNum} className="preview-folder-row">
                        <div className="preview-folder-tag">
                          <span className="folder-number">Folder {folderNum}</span>
                          <span className="segments-count">{sortedEntries.length} items</span>
                        </div>
                        <div className="preview-folder-cells">
                          {sortedEntries.map((entry, idx) => (
                            <div key={entry.id || idx} className="preview-image-cell">
                              <div className="cell-image-wrapper">
                                {entry.imageDataUrl ? (
                                  <img 
                                    src={entry.imageDataUrl} 
                                    alt={`${folderNum} - ${entry.label}`} 
                                    className="cell-image-thumbnail"
                                  />
                                ) : (
                                  <div className="cell-image-missing">No Image</div>
                                )}
                              </div>
                              <div className="cell-meta">
                                <span className="cell-label">{entry.label}</span>
                                <span className="cell-source" title={`From ${entry.zipName}`}>
                                  {entry.zipName ? entry.zipName.slice(0, 12) + '...' : ''}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
