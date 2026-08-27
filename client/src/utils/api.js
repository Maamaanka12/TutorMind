const API_BASE = '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  // Auth
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  getMe: () => request('/auth/me'),

  // Materials
  getMaterials: () => request('/materials'),
  getMaterial: (id) => request(`/materials/${id}`),
  uploadMaterial: (formData) => request('/materials', { method: 'POST', body: formData }),
  deleteMaterial: (id) => request(`/materials/${id}`, { method: 'DELETE' }),

  // AI
  analyzeMaterial: (materialId) => request('/ai/analyze', { method: 'POST', body: JSON.stringify({ materialId }) }),
  generateQuestions: (conceptId, count) => request('/ai/generate-questions', { method: 'POST', body: JSON.stringify({ conceptId, count }) }),
  evaluate: (questionId, selectedAnswer) => request('/ai/evaluate', { method: 'POST', body: JSON.stringify({ questionId, selectedAnswer }) }),
  getProfile: () => request('/ai/profile'),
  getMisconceptions: () => request('/ai/misconceptions'),
};
