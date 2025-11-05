const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://localhost:4000/api';

async function handleResponse(response) {
  if (!response.ok) {
    let message = 'Сталася помилка під час запиту до сервера.';
    let details = null;
    try {
      const json = await response.json();
      if (json?.error) {
        message = json.error;
      }
      details = json;
    } catch {
      // ignore parse errors
    }
    const error = new Error(message);
    error.status = response.status;
    error.details = details;
    throw error;
  }
  return response.json();
}

function buildHeaders(token, extra = {}) {
  const headers = {
    ...(extra || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function request(path, options = {}, token) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: buildHeaders(token, options.headers),
  });
  return handleResponse(response);
}

export async function fetchTasks(token) {
  const data = await request('/tasks', {}, token);
  return data.tasks ?? [];
}

export async function createTask(payload, token) {
  const data = await request(
    '/tasks',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    token,
  );
  return data;
}

export async function updateTask(id, payload, token) {
  const data = await request(
    `/tasks/${id}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    token,
  );
  return data.task;
}

export async function cancelTask(id, token) {
  const data = await request(
    `/tasks/${id}/cancel`,
    {
      method: 'POST',
    },
    token,
  );
  return data.task;
}
