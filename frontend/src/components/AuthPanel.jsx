import React, { useState } from 'react';

function AuthPanel({ onLogin, loading }) {
  const [mode, setMode] = useState('login'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Введіть email та пароль.');
      return;
    }

    try {
      await onLogin({ mode, email, password });
    } catch (err) {
      setError(err?.message ?? 'Не вдалося виконати авторизацію.');
    }
  };

  return (
    <div className="auth-panel">
      <h2>{mode === 'login' ? 'Вхід до аккаунту' : 'Реєстрація'}</h2>
      <p className="auth-panel__sub">
        Для керування задачами необхідно авторизуватися.
      </p>

      <form className="auth-panel__form" onSubmit={handleSubmit}>
        <label className="auth-panel__field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
            disabled={loading}
          />
        </label>
        <label className="auth-panel__field">
          <span>Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            disabled={loading}
          />
        </label>
        {error ? <div className="auth-panel__error">{error}</div> : null}
        <button type="submit" className="btn auth-panel__submit" disabled={loading}>
          {loading ? 'Зачекайте…' : mode === 'login' ? 'Увійти' : 'Зареєструватися'}
        </button>
      </form>

      <div className="auth-panel__switch">
        {mode === 'login' ? (
          <>
            <span>Ще немає аккаунту?</span>

            <button type="button" onClick={() => { setMode('register'); setError(''); }} disabled={loading}>
              Зареєструватися
            </button>
          </>
        ) : (
          <>
            <span>Вже зареєстровані?</span>
            
            <button type="button" onClick={() => { setMode('login'); setError(''); }} disabled={loading}>
              Увійти
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default AuthPanel;
