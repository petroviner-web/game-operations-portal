import type { SessionDetail } from './sessions';
export class SessionError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}
export async function sessionRequest(path: string, body?: unknown): Promise<SessionDetail> {
  let response: Response;
  try {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      const csrf = await fetch('/api/v1/auth/csrf', {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!csrf.ok) throw new Error('CSRF unavailable');
      const { csrfToken } = await csrf.json();
      if (typeof csrfToken !== 'string') throw new Error('Invalid CSRF');
      headers['X-CSRF-Token'] = csrfToken;
      headers['Content-Type'] = 'application/json';
    }
    response = await fetch(`/api/v1/projects/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new SessionError(
      'We could not confirm the result. Refresh the session before retrying. Your input is still here.',
    );
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new SessionError(
      typeof result.message === 'string'
        ? result.message
        : 'The request failed. Refresh and try again.',
      response.status,
    );
  return result.session;
}
export function showSession(project: string, id: string) {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- REST mutations require a fresh server-rendered document.
  window.location.assign(
    `/workspace/projects/${encodeURIComponent(project)}/sessions/${encodeURIComponent(id)}`,
  );
}
