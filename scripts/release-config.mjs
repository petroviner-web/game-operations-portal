export function releaseEnvironment(input) {
  const env = { ...input, NODE_ENV: 'production' };
  env.APP_ORIGIN = input.APP_ORIGIN || input.RENDER_EXTERNAL_URL || '';
  env.API_PORT = input.API_PORT ?? '4000';
  env.PORT = input.PORT ?? '3000';
  env.WEB_HOST = input.WEB_HOST ?? '127.0.0.1';
  for (const key of ['PORT', 'API_PORT']) {
    if (!/^\d+$/.test(env[key]) || Number(env[key]) < 1 || Number(env[key]) > 65535)
      throw new Error(`${key} must be a port from 1 to 65535.`);
  }
  if (Number(env.PORT) === Number(env.API_PORT)) throw new Error('PORT and API_PORT must differ.');
  if (!['127.0.0.1', '0.0.0.0'].includes(env.WEB_HOST))
    throw new Error('WEB_HOST must be 127.0.0.1 or 0.0.0.0.');
  const apiOrigin = `http://127.0.0.1:${Number(env.API_PORT)}`;
  if (input.API_ORIGIN && input.API_ORIGIN !== apiOrigin)
    throw new Error('API_ORIGIN must match the loopback API_PORT.');
  env.API_ORIGIN = apiOrigin;
  return env;
}

export function verifyBuiltProxy(manifest, apiOrigin) {
  const rewrites = Array.isArray(manifest.rewrites)
    ? manifest.rewrites
    : Object.values(manifest.rewrites ?? {}).flat();
  const proxy = rewrites.find((entry) => entry.source === '/api/v1/:path*');
  if (proxy?.destination !== `${apiOrigin}/api/v1/:path*`)
    throw new Error('Rebuild Next.js with the same API_ORIGIN used at runtime.');
}
