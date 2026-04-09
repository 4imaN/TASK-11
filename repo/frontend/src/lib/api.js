const BASE_URL = '/api';

async function request(method, path, body, options = {}) {
  const config = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  };

  if (body && method !== 'GET') {
    if (body instanceof FormData) {
      delete config.headers['Content-Type'];
      config.body = body;
    } else {
      config.body = JSON.stringify(body);
    }
  }

  const response = await fetch(`${BASE_URL}${path}`, config);

  // Handle empty responses (204 No Content, etc.)
  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    if (!response.ok) {
      const error = new Error(response.statusText || 'Request failed');
      error.status = response.status;
      throw error;
    }
    return { success: true, data: null };
  }

  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      const error = new Error(response.statusText || 'Request failed');
      error.status = response.status;
      throw error;
    }
    return { success: false, error: { message: response.statusText } };
  }

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error?.message || 'Request failed');
    error.code = data.error?.code;
    error.status = response.status;
    error.details = data.error?.details;
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body, opts) => request('POST', path, body, opts),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),

  upload: (path, file, fieldName = 'file') => {
    const formData = new FormData();
    formData.append(fieldName, file);
    return request('POST', path, formData);
  },

  download: async (path) => {
    const response = await fetch(`${BASE_URL}${path}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition');
    const filename = disposition?.match(/filename="?(.+?)"?$/)?.[1] || 'download';
    return { blob, filename };
  },
};
