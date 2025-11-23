const API_BASE = import.meta.env.VITE_API_BASE || '/api';

async function request(path, options = {}, token) {
  const url = `${API_BASE}${path}`;

  const headers = options.headers || {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers: headers
  });

  let data = null;
  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    const message = data && data.error 
      ? data.error 
      : 'Сталася помилка запиту.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

export async function fetchTasks(token) {
  const data = await request('/tasks', {}, token);
  return data.tasks || [];
}

export async function createTask(payload, token) {
  return request(
    '/tasks',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function updateTask(id, payload, token) {
  const data = await request(
    `/tasks/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    token
  );
  return data.task;
}

export async function cancelTask(id, token) {
  const data = await request(
    `/tasks/${id}/cancel`,
    { method: 'POST' },
    token
  );
  return data.task;
}
