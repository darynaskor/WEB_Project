import React from 'react';

function TopControls({
  fileInputRef,
  onFileChange,
  onOpenPicker,
  onClearImage,
  onBack,
  onReset,
  canUndo,
  hasImage,
}) {
  return (
    <div className="top-controls">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />
      <button className="btn" type="button" onClick={onOpenPicker}>
        UPLOAD
      </button>
      <button className="btn" type="button" onClick={onClearImage} disabled={!hasImage}>
        DELETE
      </button>
    </div>
  );
}

export default TopControls;
