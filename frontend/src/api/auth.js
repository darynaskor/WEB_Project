const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://localhost:4000/api';

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

export async function register(email, password) {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(response);
}

export async function login(email, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(response);
}
