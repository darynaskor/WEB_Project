import React from 'react';

function Toolbar({ email, onLogout, logoutDisabled }) {
  return (
    <nav className="toolbar">
      <span className="toolbar-brand">IMAGE MANAGER</span>
      <div className="toolbar-user">
        <span className="toolbar-email">{email}</span>
        <button className="toolbar-logout" type="button" onClick={onLogout} disabled={logoutDisabled}>
          Вийти
        </button>
      </div>
    </nav>
  );
}

export default Toolbar;
