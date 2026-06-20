import { useState, useEffect, useRef } from 'react';

export default function SelectionOverlay({
  selections,
  currentPage,
  onSelectionComplete,
  onDeleteSelection,
  onSelectionUpdateRect,
  isCropMode = true
}) {
  const [startPoint, setStartPoint] = useState(null); // {x, y} in normalized coordinates (0 to 1)
  const [mousePos, setMousePos] = useState(null); // {x, y} in normalized coordinates (0 to 1)
  const [editingSelectionId, setEditingSelectionId] = useState(null); // ID of selection currently in edit mode
  const [dragSelectionId, setDragSelectionId] = useState(null); // ID of selection currently being dragged
  const [tempDragRect, setTempDragRect] = useState(null); // Temporary rect coordinates during drag or edit

  const containerRef = useRef(null);
  const dragStateRef = useRef(null); // { id, handle, startPos: {x, y}, startRect: {x1, y1, x2, y2} }
  const lastTouchTimeRef = useRef(0);
  const lastSelectionTimeRef = useRef(0);

  // Filter selections for the current page
  const pageSelections = selections.filter((s) => s.page === currentPage);

  // Use a ref to store state values so that touch event handlers registered on DOM directly
  // can access the latest state without being re-bound on every state change.
  const stateRef = useRef({
    startPoint,
    mousePos,
    isCropMode,
    currentPage,
    selections,
    editingSelectionId,
    tempDragRect
  });

  // Keep ref in sync
  useEffect(() => {
    stateRef.current = {
      startPoint,
      mousePos,
      isCropMode,
      currentPage,
      selections,
      editingSelectionId,
      tempDragRect
    };
  }, [startPoint, mousePos, isCropMode, currentPage, selections, editingSelectionId, tempDragRect]);

  // Listen for Escape key to cancel current selection or exit edit mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setStartPoint(null);
        setMousePos(null);
        setEditingSelectionId(null);
        setTempDragRect(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getNormalizedCoordinates = (e) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    
    // Support touch events
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    // Clamp between 0 and 1
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y))
    };
  };

  // Mouse handlers for desktop click-to-select
  const handleMouseDown = (e) => {
    if (Date.now() - lastTouchTimeRef.current < 600) return;
    if (!isCropMode) return;
    if (e.button !== 0) return; // Left click only

    if (
      e.target.closest('.selection-delete') ||
      e.target.closest('.selection-edit') ||
      e.target.closest('.resize-handle') ||
      (stateRef.current.editingSelectionId && e.target.closest('.selection-box.is-editing'))
    ) {
      return;
    }

    const coords = getNormalizedCoordinates(e);
    if (!coords) return;

    if (!startPoint) {
      setStartPoint(coords);
      setMousePos(coords);
    } else {
      const rect = {
        x1: Math.min(startPoint.x, coords.x),
        y1: Math.min(startPoint.y, coords.y),
        x2: Math.max(startPoint.x, coords.x),
        y2: Math.max(startPoint.y, coords.y)
      };
      
      const width = Math.abs(rect.x2 - rect.x1);
      const height = Math.abs(rect.y2 - rect.y1);
      if (width > 0.01 && height > 0.01) {
        lastSelectionTimeRef.current = Date.now();
        onSelectionComplete(rect);
      }
      
      setStartPoint(null);
      setMousePos(null);
    }
  };

  const handleMouseMove = (e) => {
    if (!isCropMode) return;
    if (!startPoint) return;
    const coords = getNormalizedCoordinates(e);
    if (coords) {
      setMousePos(coords);
    }
  };

  // Add non-passive event listeners for touch events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Touch event handlers for mobile
    const handleTouchStart = (e) => {
      lastTouchTimeRef.current = Date.now();
      const state = stateRef.current;
      if (!state.isCropMode) return;

      // If multi-touch (two or more fingers), ignore drawing selection to allow zoom/pinch/pan.
      if (e.touches && e.touches.length > 1) {
        setStartPoint(null);
        setMousePos(null);
        return;
      }

      // If touching buttons, resize handles, or the active editing box body, ignore canvas drawing start
      if (
        e.target.closest('.selection-delete') ||
        e.target.closest('.selection-edit') ||
        e.target.closest('.resize-handle') ||
        (state.editingSelectionId && e.target.closest('.selection-box.is-editing'))
      ) {
        return;
      }

      const coords = getNormalizedCoordinates(e);
      if (!coords) return;

      if (!state.startPoint) {
        setStartPoint(coords);
        setMousePos(coords);
      } else {
        const rect = {
          x1: Math.min(state.startPoint.x, coords.x),
          y1: Math.min(state.startPoint.y, coords.y),
          x2: Math.max(state.startPoint.x, coords.x),
          y2: Math.max(state.startPoint.y, coords.y)
        };
        
        const width = Math.abs(rect.x2 - rect.x1);
        const height = Math.abs(rect.y2 - rect.y1);
        if (width > 0.01 && height > 0.01) {
          lastSelectionTimeRef.current = Date.now();
          onSelectionComplete(rect);
        }
        
        setStartPoint(null);
        setMousePos(null);
      }
    };

    const handleTouchMove = (e) => {
      const state = stateRef.current;
      if (!state.isCropMode) return;

      if (e.touches && e.touches.length > 1) {
        return;
      }
      if (e.touches && e.touches.length === 1) {
        e.preventDefault();
      }

      if (!state.startPoint) return;
      const coords = getNormalizedCoordinates(e);
      if (coords) {
        setMousePos(coords);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, [onSelectionComplete]);

  // Start dragging handler
  const startDrag = (id, handle, clientX, clientY, originalRect) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    // Normalized start coordinates
    const startX = (clientX - rect.left) / rect.width;
    const startY = (clientY - rect.top) / rect.height;

    dragStateRef.current = {
      id,
      handle,
      startPos: { x: startX, y: startY },
      startRect: { ...originalRect }
    };
    setDragSelectionId(id);
    setTempDragRect({ ...originalRect });
  };

  const handleBoxMouseDown = (e, id, handle, originalRect) => {
    if (Date.now() - lastTouchTimeRef.current < 600) return;
    if (e.button !== 0) return; // Left click only
    e.stopPropagation();
    startDrag(id, handle, e.clientX, e.clientY, originalRect);
  };

  const handleBoxTouchStart = (e, id, handle, originalRect) => {
    lastTouchTimeRef.current = Date.now();
    e.stopPropagation();
    if (e.touches && e.touches.length === 1) {
      startDrag(id, handle, e.touches[0].clientX, e.touches[0].clientY, originalRect);
    }
  };

  // Dragging movement listeners
  useEffect(() => {
    if (!dragSelectionId) return;

    const handleGlobalMove = (e) => {
      const state = dragStateRef.current;
      if (!state || !containerRef.current) return;

      // Prevent scrolling when dragging/resizing a selection box on mobile
      if (e.touches && e.touches.length === 1) {
        e.preventDefault();
      }

      const rect = containerRef.current.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const currentX = (clientX - rect.left) / rect.width;
      const currentY = (clientY - rect.top) / rect.height;

      // Clamp between 0 and 1
      const x = Math.max(0, Math.min(1, currentX));
      const y = Math.max(0, Math.min(1, currentY));

      const dx = x - state.startPos.x;
      const dy = y - state.startPos.y;

      const { startRect, handle } = state;
      const left = Math.min(startRect.x1, startRect.x2);
      const right = Math.max(startRect.x1, startRect.x2);
      const top = Math.min(startRect.y1, startRect.y2);
      const bottom = Math.max(startRect.y1, startRect.y2);

      let newRect = null;

      if (handle === 'tl') {
        const newLeft = Math.min(right - 0.01, Math.max(0, left + dx));
        const newTop = Math.min(bottom - 0.01, Math.max(0, top + dy));
        newRect = { x1: newLeft, y1: newTop, x2: right, y2: bottom };
      } else if (handle === 'tr') {
        const newRight = Math.max(left + 0.01, Math.min(1, right + dx));
        const newTop = Math.min(bottom - 0.01, Math.max(0, top + dy));
        newRect = { x1: left, y1: newTop, x2: newRight, y2: bottom };
      } else if (handle === 'bl') {
        const newLeft = Math.min(right - 0.01, Math.max(0, left + dx));
        const newBottom = Math.max(top + 0.01, Math.min(1, bottom + dy));
        newRect = { x1: newLeft, y1: top, x2: right, y2: newBottom };
      } else if (handle === 'br') {
        const newRight = Math.max(left + 0.01, Math.min(1, right + dx));
        const newBottom = Math.max(top + 0.01, Math.min(1, bottom + dy));
        newRect = { x1: left, y1: top, x2: newRight, y2: newBottom };
      } else if (handle === 'move') {
        const w = right - left;
        const h = bottom - top;
        const newLeft = Math.max(0, Math.min(1 - w, left + dx));
        const newTop = Math.max(0, Math.min(1 - h, top + dy));
        newRect = { x1: newLeft, y1: newTop, x2: newLeft + w, y2: newTop + h };
      }

      if (newRect) {
        setTempDragRect(newRect);
      }
    };

    const handleGlobalEnd = () => {
      // Keep changes inside tempDragRect, but don't commit to parent yet
      // Commit happens when user clicks the "Done / Checkmark" button
      setDragSelectionId(null);
      dragStateRef.current = null;
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalEnd);
    window.addEventListener('touchmove', handleGlobalMove, { passive: false });
    window.addEventListener('touchend', handleGlobalEnd);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalEnd);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('touchend', handleGlobalEnd);
    };
  }, [dragSelectionId, tempDragRect]);

  const handleToggleEditMode = (sel) => {
    if (Date.now() - lastSelectionTimeRef.current < 500) {
      return; // Ignore accidental clicks right after selection completes
    }
    if (editingSelectionId === sel.id) {
      // Commit the change!
      if (tempDragRect) {
        const left = Math.min(tempDragRect.x1, tempDragRect.x2);
        const right = Math.max(tempDragRect.x1, tempDragRect.x2);
        const top = Math.min(tempDragRect.y1, tempDragRect.y2);
        const bottom = Math.max(tempDragRect.y1, tempDragRect.y2);
        
        onSelectionUpdateRect(sel.id, { x1: left, y1: top, x2: right, y2: bottom });
      }
      setEditingSelectionId(null);
      setTempDragRect(null);
    } else {
      // Enable editing mode
      setEditingSelectionId(sel.id);
      setTempDragRect({ ...sel.rect });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`selection-overlay-container ${startPoint ? 'selecting' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      style={{ pointerEvents: isCropMode ? 'auto' : 'none' }}
    >
      {/* Existing selections on current page */}
      {pageSelections.map((sel) => {
        const isEditingThis = editingSelectionId === sel.id;
        const targetRect = (isEditingThis && tempDragRect) ? tempDragRect : sel.rect;

        const x = Math.min(targetRect.x1, targetRect.x2) * 100;
        const y = Math.min(targetRect.y1, targetRect.y2) * 100;
        const w = Math.abs(targetRect.x2 - targetRect.x1) * 100;
        const h = Math.abs(targetRect.y2 - targetRect.y1) * 100;

        return (
          <div
            key={sel.id}
            className={`selection-box ${isEditingThis ? 'is-editing' : ''}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: `${w}%`,
              height: `${h}%`
            }}
            onMouseDown={(e) => isEditingThis && handleBoxMouseDown(e, sel.id, 'move', targetRect)}
            onTouchStart={(e) => isEditingThis && handleBoxTouchStart(e, sel.id, 'move', targetRect)}
          >
            <div className="selection-badge">
              <span className="selection-badge-folder">#{sel.number}</span>
              <span className="selection-badge-label">{sel.label}</span>
            </div>

            {/* Corner Resize Handles - Only visible in edit mode */}
            {isEditingThis && (
              <>
                <div 
                  className="resize-handle tl" 
                  onMouseDown={(e) => handleBoxMouseDown(e, sel.id, 'tl', targetRect)}
                  onTouchStart={(e) => handleBoxTouchStart(e, sel.id, 'tl', targetRect)}
                />
                <div 
                  className="resize-handle tr" 
                  onMouseDown={(e) => handleBoxMouseDown(e, sel.id, 'tr', targetRect)}
                  onTouchStart={(e) => handleBoxTouchStart(e, sel.id, 'tr', targetRect)}
                />
                <div 
                  className="resize-handle bl" 
                  onMouseDown={(e) => handleBoxMouseDown(e, sel.id, 'bl', targetRect)}
                  onTouchStart={(e) => handleBoxTouchStart(e, sel.id, 'bl', targetRect)}
                />
                <div 
                  className="resize-handle br" 
                  onMouseDown={(e) => handleBoxMouseDown(e, sel.id, 'br', targetRect)}
                  onTouchStart={(e) => handleBoxTouchStart(e, sel.id, 'br', targetRect)}
                />
              </>
            )}

            <button
              className="selection-delete"
              onClick={(e) => {
                e.stopPropagation();
                if (isEditingThis) {
                  setEditingSelectionId(null);
                  setTempDragRect(null);
                }
                onDeleteSelection(sel.id);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              title="Delete selection"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            <button
              className={`selection-edit ${isEditingThis ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleEditMode(sel);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              title={isEditingThis ? "Confirm changes" : "Edit coordinates"}
            >
              {isEditingThis ? (
                // Checkmark icon
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                // Pencil icon
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              )}
            </button>
          </div>
        );
      })}

      {/* active preview box while selecting */}
      {startPoint && mousePos && (
        <>
          <div
            className="selection-preview-box"
            style={{
              left: `${Math.min(startPoint.x, mousePos.x) * 100}%`,
              top: `${Math.min(startPoint.y, mousePos.y) * 100}%`,
              width: `${Math.abs(startPoint.x - mousePos.x) * 100}%`,
              height: `${Math.abs(startPoint.y - mousePos.y) * 100}%`
            }}
          >
            <div className="selection-badge-preview">Drawing selection... (Esc to cancel)</div>
          </div>
          {/* Visual guiding crosshairs */}
          <div className="crosshair-h" style={{ top: `${mousePos.y * 100}%` }}></div>
          <div className="crosshair-v" style={{ left: `${mousePos.x * 100}%` }}></div>
        </>
      )}
    </div>
  );
}
