const API_BASE = import.meta.env.VITE_API_BASE || '/api';

async function authRequest(path, email, password) {
  const url = `${API_BASE}${path}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
    }

    if (!response.ok) {
      const message =
        data && data.error
          ? data.error
          : 'Сталася помилка авторизації';
      throw new Error(message);
    }

    return data;
  } catch (error) {
    if (
      typeof error.message === 'string' &&
      (error.message.toLowerCase().includes('network') ||
        error.message.toLowerCase().includes('failed'))
    ) {
      throw new Error(
        'Не вдалося підключитися до серверу'
      );
    }

    throw error;
  }
}

export async function register(email, password) {
  return authRequest('/auth/register', email, password);
}

export async function login(email, password) {
  return authRequest('/auth/login', email, password);
}
