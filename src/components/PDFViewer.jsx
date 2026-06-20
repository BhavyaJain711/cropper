import { useEffect, useRef, useState } from 'react';
import SelectionOverlay from './SelectionOverlay';

export default function PDFViewer({
  pdfDoc,
  currentPage,
  selections,
  onSelectionComplete,
  onDeleteSelection,
  onSelectionUpdateRect
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);
  
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [renderedViewport, setRenderedViewport] = useState(null);
  const [renderedPageObj, setRenderedPageObj] = useState(null);
  const [isCropMode, setIsCropMode] = useState(true);

  // Trigger re-render whenever PDF, page, or scale changes
  useEffect(() => {
    if (!pdfDoc) return;

    let isCurrent = true;

    async function draw() {
      // Cancel previous rendering if still running
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore cancel error
        }
      }

      setLoading(true);
      setError(null);

      try {
        const page = await pdfDoc.getPage(currentPage);
        if (!isCurrent) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        
        if (isCurrent) {
          setRenderedViewport(viewport);
          setRenderedPageObj(page);
          setLoading(false);
        }
      } catch (err) {
        if (err.name !== 'RenderingCancelledException' && isCurrent) {
          console.error('PDF render error:', err);
          setError('Failed to render PDF page. Please try reloading.');
          setLoading(false);
        }
      }
    }

    draw();

    return () => {
      isCurrent = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, currentPage, scale]);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.6));
  const handleZoomReset = () => {
    if (!containerRef.current || !canvasRef.current) return;
    // Calculate scale to fit width
    const containerWidth = containerRef.current.clientWidth - 40;
    pdfDoc.getPage(currentPage).then(page => {
      const originalViewport = page.getViewport({ scale: 1 });
      const fitScale = containerWidth / originalViewport.width;
      setScale(Math.round(fitScale * 10) / 10);
    });
  };

  const handleSelectionComplete = async (rect) => {
    if (!renderedPageObj || !renderedViewport || !canvasRef.current) return;
    onSelectionComplete(rect, renderedPageObj, renderedViewport, canvasRef.current);
  };

  const handleSelectionUpdateRect = async (id, rect) => {
    if (!renderedPageObj || !renderedViewport) return;
    onSelectionUpdateRect(id, rect, renderedPageObj, renderedViewport);
  };

  if (!pdfDoc) {
    return (
      <div className="pdf-viewer-empty">
        <div className="empty-message-container">
          <svg className="empty-icon" xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>
          <h3>No PDF Loaded</h3>
          <p>Choose a PDF file using the Open PDF button above to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-viewer-wrapper" ref={containerRef}>
      {/* Zoom and Page controls */}
      <div className="pdf-controls-overlay">
        <div className="zoom-controls">
          <div className="tool-toggle-group">
            <button 
              className={`btn-tool ${!isCropMode ? 'active' : ''}`}
              onClick={() => setIsCropMode(false)}
              title="Scroll Mode (Touch to Scroll)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="3"/><path d="M6.5 21.5h11a2.5 2.5 0 0 0 2.5-2.5v-3.5a2.5 2.5 0 0 0-2.5-2.5h-1v-2a2 2 0 0 0-2-2h-1.5a1.5 1.5 0 0 0-1.5-1.5h-1a1.5 1.5 0 0 0-1.5 1.5V11h-1.5a2 2 0 0 0-2 2v4a4.5 4.5 0 0 0 4.5 4.5z"/></svg>
            </button>
            <button 
              className={`btn-tool ${isCropMode ? 'active' : ''}`}
              onClick={() => setIsCropMode(true)}
              title="Crop Mode (Drag to Select)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
            </button>
          </div>
          <span className="control-separator">|</span>
          <button className="btn btn-secondary btn-icon" onClick={handleZoomOut} title="Zoom Out">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <span className="zoom-percentage">{Math.round(scale * 100)}%</span>
          <button className="btn btn-secondary btn-icon" onClick={handleZoomIn} title="Zoom In">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button className="btn btn-secondary btn-text" onClick={handleZoomReset} title="Fit Width">
            Fit
          </button>
        </div>
      </div>

      {loading && (
        <div className="pdf-loading-spinner">
          <div className="spinner"></div>
          <span>Rendering Page...</span>
        </div>
      )}

      {error && (
        <div className="pdf-error-toast">
          <span>{error}</span>
        </div>
      )}

      <div className="pdf-scroll-container">
        <div 
          className="canvas-overlay-container" 
          style={{ 
            width: renderedViewport ? `${renderedViewport.width}px` : 'auto',
            height: renderedViewport ? `${renderedViewport.height}px` : 'auto'
          }}
        >
          <canvas ref={canvasRef} className="pdf-canvas" />
          {renderedViewport && (
            <SelectionOverlay
              selections={selections}
              currentPage={currentPage}
              onSelectionComplete={handleSelectionComplete}
              onDeleteSelection={onDeleteSelection}
              onSelectionUpdateRect={handleSelectionUpdateRect}
              isCropMode={isCropMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}
