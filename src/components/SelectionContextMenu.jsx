import { useEffect, useRef, useState, useLayoutEffect } from 'react';

export default function SelectionContextMenu({
  isOpen,
  position,
  selection,
  onClose,
  onCopyImage,
  onCopyText,
  onDelete
}) {
  const menuRef = useRef(null);
  const [adjustedPos, setAdjustedPos] = useState({ x: position?.x || 0, y: position?.y || 0 });
  const [copyingImage, setCopyingImage] = useState(false);
  const [imageCopiedAnim, setImageCopiedAnim] = useState(false);

  // Reposition context menu if it overflows the window edges
  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current || !position) return;

    const menuEl = menuRef.current;
    const rect = menuEl.getBoundingClientRect();
    const padding = 12;

    let posX = position.x;
    let posY = position.y;

    if (posX + rect.width + padding > window.innerWidth) {
      posX = Math.max(padding, window.innerWidth - rect.width - padding);
    }
    if (posY + rect.height + padding > window.innerHeight) {
      posY = Math.max(padding, window.innerHeight - rect.height - padding);
    }

    setAdjustedPos({ x: posX, y: posY });
  }, [isOpen, position, selection]);

  // Click outside, scroll, resize, or escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleScrollOrResize = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !selection) return null;

  const handleCopyImageClick = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (copyingImage) return;

    try {
      setCopyingImage(true);
      await onCopyImage(selection);
      setImageCopiedAnim(true);
      setTimeout(() => {
        onClose();
      }, 350);
    } catch (err) {
      console.error('Error copying image:', err);
    } finally {
      setCopyingImage(false);
    }
  };

  const handleCopyTextClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onCopyText(selection);
    onClose();
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onDelete(selection);
    onClose();
  };

  const hasText = Boolean(selection.text && selection.text.trim());

  return (
    <div
      ref={menuRef}
      className="selection-context-menu"
      style={{
        left: `${adjustedPos.x}px`,
        top: `${adjustedPos.y}px`
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Context Menu Header */}
      <div className="context-menu-header">
        <div className="context-menu-title-row">
          <span className="context-menu-badge-folder">#{selection.number}</span>
          <span className="context-menu-label-name">{selection.label}</span>
          <span className="context-menu-page-tag">Page {selection.page}</span>
        </div>
        {selection.imageDataUrl && (
          <div className="context-menu-thumbnail-wrapper">
            <img
              src={selection.imageDataUrl}
              alt={`Crop of page ${selection.page}`}
              className="context-menu-thumbnail"
            />
          </div>
        )}
      </div>

      <div className="context-menu-divider" />

      {/* Main Options */}
      <div className="context-menu-items">
        <button
          className={`context-menu-item primary ${imageCopiedAnim ? 'copied' : ''}`}
          onClick={handleCopyImageClick}
          disabled={copyingImage}
          title="Copy high-resolution cropped selection image to clipboard"
        >
          <span className="item-icon">
            {imageCopiedAnim ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                <circle cx="13" cy="13" r="1" />
                <path d="M19 19l-3-3-4 4" />
              </svg>
            )}
          </span>
          <div className="item-label-group">
            <span className="item-title">
              {imageCopiedAnim ? 'Image Copied!' : copyingImage ? 'Copying...' : 'Copy as Image'}
            </span>
            <span className="item-subtitle">High-resolution PNG</span>
          </div>
          <span className="item-badge">PNG</span>
        </button>

        {hasText && (
          <button
            className="context-menu-item"
            onClick={handleCopyTextClick}
            title="Copy extracted OCR / text layer content"
          >
            <span className="item-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </span>
            <div className="item-label-group">
              <span className="item-title">Copy Extracted Text</span>
              <span className="item-subtitle">{selection.text.length > 25 ? selection.text.slice(0, 25) + '…' : selection.text}</span>
            </div>
            <span className="item-badge">TXT</span>
          </button>
        )}

        <div className="context-menu-divider" />

        <button
          className="context-menu-item danger"
          onClick={handleDeleteClick}
          title="Delete this selection"
        >
          <span className="item-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </span>
          <div className="item-label-group">
            <span className="item-title">Delete Selection</span>
          </div>
        </button>
      </div>
    </div>
  );
}
