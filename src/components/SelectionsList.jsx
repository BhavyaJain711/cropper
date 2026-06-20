import { useState } from 'react';

function EditableText({ initialText, onSave }) {
  const [text, setText] = useState(initialText || '');
  const [prevInitialText, setPrevInitialText] = useState(initialText);

  if (initialText !== prevInitialText) {
    setPrevInitialText(initialText);
    setText(initialText || '');
  }

  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== (initialText || '')) {
          onSave(text);
        }
      }}
      onClick={(e) => e.stopPropagation()}
      placeholder="No text layer (click to type text/notes...)"
      className="card-edit-textarea"
      title="Edit extracted text (auto-saves on blur)"
    />
  );
}

export default function SelectionsList({
  selections,
  onDeleteSelection,
  onJumpToPage,
  onClearAll,
  onUpdateSelection,
  labelOptions = [],

  // Sessions management
  activeFileName,
  savedSessionsList = {},
  onLoadSession,
  onDeleteSession,
  onClearAllSessions,
  onExportSessionsJSON,
  onImportSessionsJSON
}) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('selections');

  // Group selections by folder number
  const groupedSelections = selections.reduce((groups, selection) => {
    const num = selection.number || 0;
    if (!groups[num]) {
      groups[num] = [];
    }
    groups[num].push(selection);
    return groups;
  }, {});

  // Sort folder groups by the index of their most recent selection (newest first)
  const sortedFolders = Object.keys(groupedSelections).sort((a, b) => {
    const maxIndexA = Math.max(...groupedSelections[a].map(sel => selections.indexOf(sel)));
    const maxIndexB = Math.max(...groupedSelections[b].map(sel => selections.indexOf(sel)));
    return maxIndexB - maxIndexA;
  });

  const toggleMobileExpanded = () => {
    setMobileExpanded(!mobileExpanded);
  };

  const handleExportIndividualSession = (e, sessionFileName, sessionData) => {
    e.stopPropagation();
    const blob = new Blob([JSON.stringify({ [sessionFileName]: sessionData }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cropper_session_${sessionFileName.replace(/\.[^/.]+$/, "")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const savedSessionsKeys = Object.keys(savedSessionsList).sort((a, b) => {
    const dateA = new Date(savedSessionsList[a].lastModified || 0);
    const dateB = new Date(savedSessionsList[b].lastModified || 0);
    return dateB - dateA; // Sort newest first
  });

  return (
    <div className={`selections-sidebar ${mobileExpanded ? 'mobile-expanded' : ''}`}>
      {/* Mobile Drawer Header / Pull bar */}
      <div className="sidebar-mobile-handle" onClick={toggleMobileExpanded}>
        <div className="handle-bar"></div>
        <div className="mobile-title-row">
          <span>Extractions ({selections.length}) & Saved Projects</span>
          <button className="btn-mobile-toggle">
            {mobileExpanded ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
            )}
          </button>
        </div>
      </div>

      {/* Sidebar Navigation Tabs */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'selections' ? 'active' : ''}`}
          onClick={() => setActiveTab('selections')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="19" x2="15" y2="19"/><line x1="9" y1="11" x2="10" y2="11"/></svg>
          Active Crop ({selections.length})
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          Saved Projects ({savedSessionsKeys.length})
        </button>
      </div>

      {/* Sidebar Content */}
      <div className="sidebar-content">
        {activeTab === 'selections' ? (
          <>
            <div className="sidebar-header">
              <h2>Active Selections</h2>
              {selections.length > 0 && (
                <button className="btn-clear-all" onClick={onClearAll} title="Clear all selections">
                  Clear All
                </button>
              )}
            </div>

            {selections.length === 0 ? (
              <div className="sidebar-empty">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {activeFileName ? (
                  <>
                    <p>No selections made on this PDF yet.</p>
                    <span className="instructions-hint">
                      1. Set <strong>Folder #</strong> and <strong>File Label</strong><br />
                      2. Click top-left corner on PDF<br />
                      3. Click bottom-right corner to crop
                    </span>
                  </>
                ) : (
                  <>
                    <p>Please open a PDF file to begin cropping.</p>
                    <span className="instructions-hint">
                      Or go to the <strong>Saved Projects</strong> tab to load your previous workspace.
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div className="sidebar-groups-container">
                {sortedFolders.map((folderNum) => (
                  <div key={folderNum} className="folder-group">
                    <div className="folder-group-title">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                      <span>Folder Group #{folderNum}</span>
                    </div>
                    
                    <div className="folder-group-items">
                      {[...groupedSelections[folderNum]].reverse().map((sel) => (
                        <div 
                          key={sel.id} 
                          className="selection-card"
                          onClick={() => onJumpToPage(sel.page)}
                        >
                          <div className="selection-card-header">
                            <div className="card-editor-fields" onClick={(e) => e.stopPropagation()}>
                              {/* Label drop down select */}
                              <select
                                className="card-edit-select"
                                value={sel.label}
                                onChange={(e) => onUpdateSelection(sel.id, { label: e.target.value })}
                                title="Change label"
                              >
                                {labelOptions.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                                {!labelOptions.includes(sel.label) && (
                                  <option value={sel.label}>{sel.label}</option>
                                )}
                              </select>

                              {/* Folder number input */}
                              <span className="folder-number-prefix">#</span>
                              <input
                                type="number"
                                className="card-edit-number"
                                min="0"
                                value={sel.number}
                                onChange={(e) => onUpdateSelection(sel.id, { number: parseInt(e.target.value, 10) || 0 })}
                                title="Change folder number"
                              />
                            </div>

                            <div className="card-meta">
                              <span>Page {sel.page}</span>
                              <button
                                className="btn-card-delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteSelection(sel.id);
                                }}
                                title="Delete this extraction"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            </div>
                          </div>

                          {/* Image Preview */}
                          {sel.imageDataUrl && (
                            <div className="card-image-preview">
                              <img src={sel.imageDataUrl} alt={`Crop of page ${sel.page}`} />
                            </div>
                          )}

                          {/* Extracted Text Area */}
                          <div className="card-text-details">
                            <EditableText
                              initialText={sel.text}
                              onSave={(newText) => onUpdateSelection(sel.id, { text: newText })}
                            />
                            {sel.fontFamily && (
                              <div className="text-style-meta">
                                <span>Style: <code>{sel.fontFamily}</code></span>
                                <span>Size: <code>{sel.fontSize}pt</code></span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Saved Projects Tab */
          <>
            <div className="sidebar-header">
              <h2>Saved Sessions</h2>
              <div className="sessions-header-actions">
                <button
                  className="btn-sessions-action"
                  onClick={onExportSessionsJSON}
                  title="Backup all saved sessions to a JSON file"
                >
                  Backup All
                </button>
                <label className="btn-sessions-action-label" title="Restore sessions from a JSON backup">
                  Import Backup
                  <input
                    type="file"
                    accept="application/json"
                    onChange={onImportSessionsJSON}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>

            <div className="sessions-list-container">
              {savedSessionsKeys.length === 0 ? (
                <div className="sidebar-empty">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  <p>No saved projects in local storage.</p>
                  <span className="instructions-hint">
                    Sessions are saved automatically as you load a PDF and make selections.
                  </span>
                </div>
              ) : (
                <div className="saved-sessions-list">
                  {savedSessionsKeys.map((sessionName) => {
                    const session = savedSessionsList[sessionName];
                    const isActive = sessionName === activeFileName;
                    const dateStr = session.lastModified 
                      ? new Date(session.lastModified).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : 'Unknown Date';

                    return (
                      <div
                        key={sessionName}
                        className={`session-row-card ${isActive ? 'active' : ''}`}
                        onClick={() => onLoadSession(sessionName, session)}
                        title={isActive ? 'Active project workspace' : 'Click to load this workspace'}
                      >
                        <div className="session-card-body">
                          <div className="session-title-group">
                            <span className="session-name" title={sessionName}>{sessionName}</span>
                            {isActive && <span className="active-badge">Active</span>}
                          </div>
                          
                          <div className="session-details-group">
                            <span>{session.selections?.length || 0} extraction(s)</span>
                            <span className="bullet-separator">•</span>
                            <span>{dateStr}</span>
                          </div>
                        </div>

                        <div className="session-actions-overlay">
                          <button
                            className="session-icon-btn btn-export-session"
                            onClick={(e) => handleExportIndividualSession(e, sessionName, session)}
                            title="Export this session as JSON file"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          </button>
                          <button
                            className="session-icon-btn btn-delete-session"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSession(sessionName);
                            }}
                            title="Delete this session from storage"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <div className="sidebar-sessions-footer">
                    <button className="btn-clear-all-sessions" onClick={onClearAllSessions}>
                      Clear All Saved Sessions
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
