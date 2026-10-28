export class AuthError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function authMutation(
  action: 'login' | 'register' | 'logout',
  body?: { email: string; password: string },
) {
  let response: Response;
  try {
    const csrf = await fetch('/api/v1/auth/csrf', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!csrf.ok) throw new Error('CSRF request failed');
    const { csrfToken } = await csrf.json();
    if (typeof csrfToken !== 'string') throw new Error('Invalid CSRF response');
    response = await fetch(`/api/v1/auth/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(body || {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new AuthError('We could not reach the account service. Please try again.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const fieldErrors: Record<string, string> = {};
    for (const field of ['email', 'password']) {
      if (typeof error.fieldErrors?.[field] === 'string')
        fieldErrors[field] = error.fieldErrors[field];
    }
    const retry = Number(response.headers.get('Retry-After'));
    const message =
      response.status === 429 && retry > 0
        ? `Too many attempts. Try again in ${Math.ceil(retry / 60)} minutes.`
        : typeof error.message === 'string'
          ? error.message
          : 'Something went wrong. Please try again.';
    throw new AuthError(message, fieldErrors);
  }
}
