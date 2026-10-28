export function readAuthConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  const secret = env.CSRF_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith('replace-')) {
    throw new Error('CSRF_SECRET must be a random secret of at least 32 characters.');
  }
  const origin = env.APP_ORIGIN || (production ? '' : 'http://127.0.0.1:3000');
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error('APP_ORIGIN must be an explicit HTTP(S) origin.');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.origin !== origin ||
    (production && parsed.protocol !== 'https:')
  ) {
    throw new Error('APP_ORIGIN must be an origin without a path, using HTTPS in production.');
  }
  return {
    secret,
    origin,
    production,
    sessionCookie: production ? '__Host-gameops_session' : 'gameops_session',
    csrfCookie: production ? '__Host-gameops_csrf' : 'gameops_csrf',
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
    csrfTtlMs: 60 * 60 * 1000,
    cookieOptions: { httpOnly: true, secure: production, sameSite: 'lax' as const, path: '/' },
  };
}
