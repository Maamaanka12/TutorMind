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
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.aiError = data.aiError || false;
    err.errorType = data.errorType || null;
    throw err;
  }
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
  previewMaterial: (formData) => request('/materials/preview', { method: 'POST', body: formData }),
  uploadMaterial: (formData) => request('/materials', { method: 'POST', body: formData }),
  deleteMaterial: (id) => request(`/materials/${id}`, { method: 'DELETE' }),

  // AI
  analyzeMaterial: (materialId) => request('/ai/analyze', { method: 'POST', body: JSON.stringify({ materialId }) }),
  generateQuestions: (conceptId, count) => request('/ai/generate-questions', { method: 'POST', body: JSON.stringify({ conceptId, count }) }),
  evaluate: (questionId, selectedAnswer) => request('/ai/evaluate', { method: 'POST', body: JSON.stringify({ questionId, selectedAnswer }) }),
  getProfile: () => request('/ai/profile'),
  getMisconceptions: () => request('/ai/misconceptions'),
  getLearningContext: () => request('/ai/learning-context'),

  // Flashcards
  generateFlashcards: (body) => request('/flashcards/generate', { method: 'POST', body: JSON.stringify(body) }),
  getFlashcards: (params) => {
    const query = new URLSearchParams(params).toString();
    return request(`/flashcards?${query}`);
  },
  getFlashcardStats: () => request('/flashcards/stats'),
  getFlashcardsForReview: (limit) => request(`/flashcards/review?limit=${limit || 20}`),
  reviewFlashcard: (id, correct) => request(`/flashcards/${id}/review`, { method: 'POST', body: JSON.stringify({ correct }) }),
  updateFlashcard: (id, body) => request(`/flashcards/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteFlashcard: (id) => request(`/flashcards/${id}`, { method: 'DELETE' }),

  // Exams
  generateExam: (body) => request('/exams/generate', { method: 'POST', body: JSON.stringify(body) }),
  getExam: (id) => request(`/exams/${id}`),
  answerExamQuestion: (examId, body) => request(`/exams/${examId}/answer`, { method: 'POST', body: JSON.stringify(body) }),
  submitExam: (examId) => request(`/exams/${examId}/submit`, { method: 'POST' }),
  getExamHistory: () => request('/exams'),

  // Learning Twin
  getLearningTwin: () => request('/learning-twin'),
  getLearningTwinContext: () => request('/learning-twin/context'),
  getLearningRecommendations: () => request('/learning-twin/recommendations'),
  recordMisconception: (body) => request('/learning-twin/misconceptions', { method: 'POST', body: JSON.stringify(body) }),
  resolveMisconception: (id) => request(`/learning-twin/misconceptions/${id}/resolve`, { method: 'PUT' }),
  detectPatterns: () => request('/learning-twin/detect-patterns', { method: 'POST' }),
  syncLearningTwin: () => request('/learning-twin/sync', { method: 'POST' }),
  getLearningCycle: () => request('/learning-twin/cycle'),

  // Flashcard session tracking
  completeFlashcardSession: (body) => request('/flashcards/session-complete', { method: 'POST', body: JSON.stringify(body) }),

  // Why Engine
  analyzeWrongAnswer: (body) => request('/why-engine/analyze', { method: 'POST', body: JSON.stringify(body) }),
  resolveFollowUp: (body) => request('/why-engine/resolve', { method: 'POST', body: JSON.stringify(body) }),
  freeFormAnalysis: (body) => request('/why-engine/free-form', { method: 'POST', body: JSON.stringify(body) }),
  getWhyEngineHistory: (limit) => request(`/why-engine/history?limit=${limit || 20}`),
  getWhyEngineStats: () => request('/why-engine/stats'),
  getWhyEngineSession: (id) => request(`/why-engine/session/${id}`),
};
