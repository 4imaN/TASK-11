const API_BACKEND = process.env.API_BACKEND_URL || process.env.VITE_API_URL || 'http://localhost:3020';

export async function handle({ event, resolve }) {
  if (event.url.pathname.startsWith('/api')) {
    const targetUrl = `${API_BACKEND}${event.url.pathname}${event.url.search}`;
    const headers = new Headers(event.request.headers);
    headers.delete('host');

    const response = await fetch(targetUrl, {
      method: event.request.method,
      headers,
      body: event.request.method !== 'GET' && event.request.method !== 'HEAD'
        ? await event.request.arrayBuffer()
        : undefined,
      duplex: 'half',
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('transfer-encoding');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }

  return resolve(event);
}
