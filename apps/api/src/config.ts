export interface AppConfig {
  databaseUrl: string;
  port: number;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required. Copy .env.example to .env.');
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (
    !['postgresql:', 'postgres:'].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.pathname.length < 2
  ) {
    throw new Error('DATABASE_URL must identify a PostgreSQL host and database.');
  }
  const port = Number(env.API_PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('API_PORT must be an integer from 1 to 65535.');
  return { databaseUrl, port };
}
