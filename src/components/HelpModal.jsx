import { useState } from 'react';

export default function HelpModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('both'); // 'both', 'desktop', 'mobile'

  if (!isOpen) return null;

  return (
    <div className="help-modal-overlay" onClick={onClose}>
      <div className="help-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="help-close-btn" onClick={onClose} aria-label="Close guide">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        
        <div className="help-header-section">
          <h3>Cropper Studio Guide</h3>
          <p className="help-subtitle">Compare device experiences. We recommend Desktop for the fastest workflow.</p>
        </div>

        {/* Tab Selection Navigation */}
        <div className="help-tabs">
          <button 
            className={`help-tab-btn ${activeTab === 'both' ? 'active' : ''}`}
            onClick={() => setActiveTab('both')}
          >
            🔄 Compare Side-by-Side
          </button>
          <button 
            className={`help-tab-btn ${activeTab === 'desktop' ? 'active' : ''}`}
            onClick={() => setActiveTab('desktop')}
          >
            🖥️ Desktop Guide
          </button>
          <button 
            className={`help-tab-btn ${activeTab === 'mobile' ? 'active' : ''}`}
            onClick={() => setActiveTab('mobile')}
          >
            📱 Mobile Guide
          </button>
        </div>

        {/* Desktop Experience recommendation banner */}
        {activeTab !== 'desktop' && (
          <div className="experience-recommendation-banner">
            <span className="banner-icon">💡</span>
            <div className="banner-content">
              <strong>Desktop Recommended:</strong> For the ultimate speed, precision, and efficiency, use Cropper Studio on a <strong>Desktop/Laptop</strong>. You will enjoy a much larger drawing workspace and robust keyboard keybindings.
            </div>
          </div>
        )}
        
        <div className={`help-sections-grid ${activeTab === 'both' ? 'both-views' : 'single-view'}`}>
          {/* Desktop Section */}
          {(activeTab === 'both' || activeTab === 'desktop') && (
            <div className="help-section desktop-experience">
              <h4>🖥️ Desktop (Recommended Experience)</h4>
              <p className="experience-badge-text">Provides maximum speed and accessibility via keyboard shortcuts.</p>
              
              <h5 className="sub-section-title">Resize & Move Selections (New!)</h5>
              <p className="edit-feature-desc">
                Click the **Edit (pencil)** button on any selection. Drag the 4 corner handles to resize, or drag the box itself to reposition. Click the **checkmark** button when done to re-crop and run OCR.
              </p>

              <h5 className="sub-section-title">Global Keybindings</h5>
              <div className="shortcut-row">
                <span className="shortcut-keys"><kbd>←</kbd> / <kbd>→</kbd></span>
                <span className="shortcut-desc">Navigate PDF Pages</span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-keys"><kbd>↑</kbd> / <kbd>↓</kbd></span>
                <span className="shortcut-desc">Cycle Active Label Options</span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-keys"><kbd>Shift</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd></span>
                <span className="shortcut-desc">Change Folder Group #</span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-keys"><kbd>Ctrl/⌘</kbd> + <kbd>Z</kbd></span>
                <span className="shortcut-desc">Undo Selection Crop</span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-keys"><kbd>Ctrl/⌘</kbd> + <kbd>Y</kbd> or <kbd>⌘+Shift+Z</kbd></span>
                <span className="shortcut-desc">Redo Selection Crop</span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-keys"><kbd>?</kbd></span>
                <span className="shortcut-desc">Toggle Help Guide</span>
              </div>

              <h5 className="sub-section-title">Label Dropdown Combobox</h5>
              <div className="shortcut-row">
                <span className="shortcut-keys"><kbd>↑</kbd> / <kbd>↓</kbd></span>
                <span className="shortcut-desc">Navigate Option List (when focused)</span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-keys"><kbd>Enter</kbd></span>
                <span className="shortcut-desc">Select Option / Add Custom Label</span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-keys"><kbd>Esc</kbd></span>
                <span className="shortcut-desc">Close Dropdown List</span>
              </div>
            </div>
          )}

          {/* Mobile Section */}
          {(activeTab === 'both' || activeTab === 'mobile') && (
            <div className="help-section mobile-experience">
              <h4>📱 Mobile Experience</h4>
              <p className="experience-badge-text">Optimized touch layout for portable device cropping.</p>

              <div className="mobile-instruction-block">
                <h5>Resize & Move Selections (New!)</h5>
                <p>Tap the **Edit (pencil)** button on any selection box. Drag the corner handles to resize, or drag the box itself to move. Tap the green **checkmark** to save and update details.</p>
              </div>

              <div className="mobile-instruction-block">
                <h5>Area Cropping</h5>
                <p>In <strong>Crop Mode</strong>, tap **first point** on the page, then tap **second point** to define the crop area. One-finger gestures are locked to point selection so screen sliding won't interfere with your taps.</p>
              </div>

              <div className="mobile-instruction-block">
                <h5>Document Scroll & Zoom</h5>
                <p>Drag with **two fingers** to scroll the page, and pinch-to-zoom. Or toggle the **Hand/Scroll tool** in the bottom overlay controls to enable standard single-finger scroll.</p>
              </div>

              <div className="mobile-instruction-block">
                <h5>Adjusting folder number</h5>
                <p>Tap the **`-`** and **`+`** adjuster buttons directly next to the **Folder #** label in the toolbar.</p>
              </div>

              <div className="mobile-instruction-block">
                <h5>Sidebar Drawer</h5>
                <p>Tap the handle bar at the bottom to slide up active crops list. Edit folder indices, update labels, or write raw text descriptions easily.</p>
              </div>
            </div>
          )}
        </div>

        <div className="help-section tips-section">
          <h4>Workflow Pro Tips</h4>
          <ul>
            <li><strong>Auto-Cycling</strong>: Once you draw a crop box, the active label in the toolbar automatically cycles to the next one in the dropdown list, allowing rapid sequential crop-tagging.</li>
            <li><strong>Inline Editing</strong>: You can change the folder group, label, and raw extracted text directly inside the cards on the sidebar. Text changes are auto-saved on focus-out.</li>
            <li><strong>Local Storage Workspaces</strong>: Your crop progress is saved in local storage automatically. Switch between different PDFs or download a JSON backup from the "Saved Projects" tab.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
