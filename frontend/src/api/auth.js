const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function handleResponse(response) {
  if (!response.ok) {
    let message = 'Сталася помилка авторизації.';
    try {
      const json = await response.json();
      if (json?.error) {
        message = json.error;
      }
    } catch {
      // ignore
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function authRequest(path, email, password) {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    return await handleResponse(response);
  } catch (error) {
    const isNetworkError = error?.message?.toLowerCase().includes('failed') || error?.message?.toLowerCase().includes('network');
    const friendlyMessage = isNetworkError
      ? 'Не вдалося підключитися до серверу. Перевірте, чи запущено бекенд і чи додано TLS-сертифікат у довірені.'
      : 'Сталася помилка авторизації. Спробуйте ще раз.';
    const wrapped = new Error(friendlyMessage);
    wrapped.cause = error;
    throw wrapped;
  }
}

export async function register(email, password) {
  return authRequest('/auth/register', email, password);
}

export async function login(email, password) {
  return authRequest('/auth/login', email, password);
}
