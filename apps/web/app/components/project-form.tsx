'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { engines, type Project } from '../../lib/projects';
import { mutateProject, ProjectError, showProject } from '../../lib/projects-client';

export function ProjectForm({ project }: { project?: Project }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ProjectError | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || '').trim();
    const description = String(data.get('description') || '');
    const engine = String(data.get('engine') || '');
    const fields: Record<string, string> = {};
    if (!name || name.length > 100)
      fields.name = 'Use a project name between 1 and 100 characters.';
    if (description.length > 2000) fields.description = 'Use no more than 2,000 characters.';
    if (!Object.hasOwn(engines, engine)) fields.engine = 'Choose a game engine.';
    if (Object.keys(fields).length) {
      setError(new ProjectError('Check the highlighted fields.', 400, fields));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await mutateProject(
        project ? `/${project.id}` : '',
        project ? 'PATCH' : 'POST',
        {
          name,
          description,
          engine,
          ...(project ? { version: project.version } : {}),
        },
      );
      showProject(saved.id);
    } catch (failure) {
      setError(
        failure instanceof ProjectError
          ? failure
          : new ProjectError('Unable to save. Please try again.'),
      );
      setBusy(false);
    }
  }
  return (
    <form className="project-form" onSubmit={submit} noValidate aria-busy={busy}>
      {error && (
        <div className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
          <strong>{error.message}</strong>
          {Object.entries(error.fieldErrors).map(([field, message]) => (
            <a key={field} href={`#project-${field}`}>
              {message}
            </a>
          ))}
          {error.status === 401 && <a href="/login">Sign in again</a>}
          {error.status === 409 && project && (
            <a href={`/workspace/projects/${project.id}/edit`}>
              Reload latest version (discard this draft)
            </a>
          )}
          {error.status === 404 && <Link href="/workspace">Back to projects</Link>}
        </div>
      )}
      <div className="form-field">
        <label htmlFor="project-name">Project name</label>
        <input
          id="project-name"
          name="name"
          defaultValue={project?.name}
          maxLength={100}
          placeholder="e.g. Orbital Arena"
          disabled={busy}
          aria-invalid={Boolean(error?.fieldErrors.name)}
          aria-describedby={error?.fieldErrors.name ? 'project-name-error' : undefined}
        />
        {error?.fieldErrors.name && (
          <p className="field-error" id="project-name-error">
            {error.fieldErrors.name}
          </p>
        )}
      </div>
      <div className="form-field">
        <label htmlFor="project-engine">Game engine</label>
        <select
          id="project-engine"
          name="engine"
          defaultValue={project?.engine || 'UNREAL'}
          disabled={busy}
          aria-invalid={Boolean(error?.fieldErrors.engine)}
          aria-describedby={
            error?.fieldErrors.engine
              ? 'project-engine-error project-engine-hint'
              : 'project-engine-hint'
          }
        >
          {Object.entries(engines).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="field-hint" id="project-engine-hint">
          For organization only. No engine installation or integration is required.
        </p>
        {error?.fieldErrors.engine && (
          <p className="field-error" id="project-engine-error">
            {error.fieldErrors.engine}
          </p>
        )}
      </div>
      <div className="form-field">
        <label htmlFor="project-description">
          Description <span className="muted">(optional)</span>
        </label>
        <textarea
          id="project-description"
          name="description"
          defaultValue={project?.description}
          rows={6}
          maxLength={2000}
          disabled={busy}
          placeholder="What are you building?"
          aria-invalid={Boolean(error?.fieldErrors.description)}
          aria-describedby={
            error?.fieldErrors.description
              ? 'project-description-error'
              : 'project-description-hint'
          }
        />
        <p className="field-hint" id="project-description-hint">
          A short brief for your game. Up to 2,000 characters.
        </p>
        {error?.fieldErrors.description && (
          <p className="field-error" id="project-description-error">
            {error.fieldErrors.description}
          </p>
        )}
      </div>
      <div className="project-form-actions">
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? 'Saving…' : project ? 'Save changes' : 'Create project'}
          <span aria-hidden="true">→</span>
        </button>
        <Link
          className="secondary-button"
          href={project ? `/workspace/projects/${project.id}` : '/workspace'}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
