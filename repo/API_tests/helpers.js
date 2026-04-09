const BASE_URL = process.env.API_URL || 'http://localhost:3020';

let sessionCookie = null;

export async function apiRequest(method, path, body, headers = {}) {
  const config = {
    method,
    headers: { ...headers },
  };

  if (sessionCookie) {
    config.headers['Cookie'] = sessionCookie;
  }

  if (body && method !== 'GET') {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, config);

  const setCookie = response.headers.get('set-cookie');
  if (setCookie && setCookie.includes('petmed_session')) {
    sessionCookie = setCookie.split(';')[0];
  }

  const data = await response.json();
  return { status: response.status, data, headers: response.headers };
}

export async function login(username, password) {
  sessionCookie = null;
  return apiRequest('POST', '/api/auth/login', { username, password });
}

export async function loginAsAdmin() {
  return login('admin', 'password123');
}

export async function loginAsBuyer() {
  return login('buyer1', 'password123');
}

export async function loginAsDispatcher() {
  return login('dispatcher1', 'password123');
}

export async function loginAsReviewer() {
  return login('reviewer1', 'password123');
}

export async function loginAsReviewer2() {
  return login('reviewer2', 'password123');
}

export function clearSession() {
  sessionCookie = null;
}

export { BASE_URL };
