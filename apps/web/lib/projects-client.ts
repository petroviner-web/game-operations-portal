import type { Project } from './projects';

export class ProjectError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}
export async function mutateProject(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<Project> {
  let response: Response;
  try {
    const csrf = await fetch('/api/v1/auth/csrf', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!csrf.ok) throw new Error('CSRF unavailable');
    const { csrfToken } = await csrf.json();
    if (typeof csrfToken !== 'string') throw new Error('Invalid CSRF');
    response = await fetch(`/api/v1/projects${path}`, {
      method,
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ProjectError(
      'We could not confirm the save. Check your projects before retrying. Your input is still here.',
    );
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fields: Record<string, string> = {};
    for (const field of ['name', 'description', 'engine']) {
      if (typeof result.fieldErrors?.[field] === 'string')
        fields[field] = result.fieldErrors[field];
    }
    throw new ProjectError(
      typeof result.message === 'string'
        ? result.message
        : 'Unable to save this project. Please try again.',
      response.status,
      fields,
    );
  }
  return result.project;
}

export function showProject(id: string) {
  // A REST mutation cannot invalidate Next's cached routes. Start with a fresh document.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Clear previously visited list/detail pages after an external API mutation.
  window.location.assign(`/workspace/projects/${encodeURIComponent(id)}`);
}
