'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SessionError, sessionRequest, showSession } from '../../lib/sessions-client';
export function SessionCreate({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SessionError | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const session = await sessionRequest(`${projectId}/sessions`, {
        name: String(data.get('name')).trim(),
        maxPlayers: Number(data.get('maxPlayers')),
      });
      showSession(projectId, session.id);
    } catch (cause) {
      setError(
        cause instanceof SessionError ? cause : new SessionError('Unable to create this lobby.'),
      );
      setBusy(false);
    }
  }
  return (
    <form className="project-form" onSubmit={submit} aria-label="Create lobby">
      <div>
        <p className="eyebrow">NEW SIMULATION</p>
        <h2>Create a lobby</h2>
        <p className="field-hint">Choose a capacity, then add test players.</p>
      </div>
      {error && (
        <div role="alert" tabIndex={-1} ref={errorRef} className="form-error">
          {error.status === 0
            ? 'We could not confirm creation. Check the session list before creating another lobby. Your input is still here.'
            : error.message}{' '}
          {error.status === 401 ? (
            <a href="/login">Sign in again</a>
          ) : (
            <a href={`/workspace/projects/${projectId}/sessions`}>Reload session list</a>
          )}
        </div>
      )}
      <div className="form-field">
        <label htmlFor="session-name">Session name</label>
        <input
          id="session-name"
          name="name"
          required
          maxLength={80}
          disabled={busy}
          placeholder="Evening playtest"
        />
      </div>
      <div className="form-field">
        <label htmlFor="max-players">Player capacity</label>
        <input
          id="max-players"
          name="maxPlayers"
          type="number"
          required
          min={2}
          max={32}
          defaultValue={4}
          disabled={busy}
          aria-describedby="capacity-hint"
        />
        <p className="field-hint" id="capacity-hint">
          2–32 players. At least two must join to start.
        </p>
      </div>
      <button className="primary-button" disabled={busy}>
        {busy ? 'Creating…' : 'Create lobby'} <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
