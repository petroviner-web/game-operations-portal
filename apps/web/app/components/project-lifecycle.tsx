'use client';

import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../lib/projects';
import { mutateProject, ProjectError, showProject } from '../../lib/projects-client';

export function ProjectLifecycle({ project }: { project: Project }) {
  const archived = project.state === 'archived';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ProjectError | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function transition() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await mutateProject(`/${project.id}/${archived ? 'restore' : 'archive'}`, 'POST', {
        version: project.version,
      });
      showProject(project.id);
    } catch (failure) {
      setError(
        failure instanceof ProjectError
          ? failure
          : new ProjectError('The change could not be confirmed. Please reload.'),
      );
      setBusy(false);
    }
  }
  return (
    <section className="lifecycle-panel" aria-labelledby="lifecycle-title">
      <div>
        <h2 id="lifecycle-title">{archived ? 'Bring this project back' : 'Taking a break?'}</h2>
        <p>
          {archived
            ? 'Restore your project to edit it and show it in your active projects.'
            : 'End running sessions and cancel open lobbies before archiving. Your project and its history are preserved, and you can restore it at any time.'}
        </p>
      </div>
      <button className="secondary-button" disabled={busy} onClick={() => void transition()}>
        {busy ? 'Updating…' : archived ? 'Restore project' : 'Archive project'}
      </button>
      {error && (
        <div ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error.message}
          <a href={error.status === 401 ? '/login' : `/workspace/projects/${project.id}`}>
            {error.status === 401 ? 'Sign in again' : 'Reload project'}
          </a>
        </div>
      )}
    </section>
  );
}
