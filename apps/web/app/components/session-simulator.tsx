'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SessionError, sessionRequest } from '../../lib/sessions-client';
import { sessionLabel, type SessionDetail } from '../../lib/sessions';
export function SessionSimulator({
  initial,
  archived,
}: {
  initial: SessionDetail;
  archived: boolean;
}) {
  const [session, setSession] = useState(initial);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SessionError | null>(null);
  const [notice, setNotice] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef<HTMLButtonElement>(null);
  const joinRef = useRef<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const path = `${session.projectId}/sessions/${session.id}`;
  async function run(suffix: string, body: unknown | undefined, message: string) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      setSession(await sessionRequest(path + suffix, body));
      setNotice(message);
      // Actions can remove their own control; put focus on a persistent control.
      refreshRef.current?.focus();
      return true;
    } catch (cause) {
      setError(
        cause instanceof SessionError ? cause : new SessionError('Unable to update this session.'),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    const trimmed = name.trim();
    if (joinRef.current?.name !== trimmed)
      joinRef.current = { id: crypto.randomUUID(), name: trimmed };
    if (await run('/players', joinRef.current, 'Player joined the lobby.')) {
      joinRef.current = null;
      setName('');
    }
  }
  const canChange = !archived && session.state !== 'ENDED';
  return (
    <>
      <section className="simulation-console" aria-label="Session simulator" aria-busy={busy}>
        <div className="simulation-top">
          <div>
            <p className="eyebrow">SESSION CONTROL</p>
            <span
              className={`project-state ${session.state === 'ENDED' ? 'archived' : 'active'}`}
              data-testid="session-state"
            >
              {sessionLabel(session)}
            </span>
          </div>
          <button
            className="secondary-button"
            ref={refreshRef}
            aria-disabled={busy}
            onClick={() => run('', undefined, 'Session refreshed.')}
          >
            {busy ? 'Working…' : 'Refresh session'}
          </button>
        </div>
        <p className="field-hint">Manual refresh · test players controlled by you</p>
        {error && (
          <div role="alert" tabIndex={-1} ref={errorRef} className="form-error">
            {error.message} {error.status === 401 && <a href="/login">Sign in again</a>}
          </div>
        )}
        <p role="status" className="simulation-notice">
          {notice}
        </p>
        <div className="simulation-occupancy">
          <strong data-testid="player-count">
            {session.activePlayers} / {session.maxPlayers}
          </strong>
          <span>active players</span>
        </div>
        <progress
          className="simulation-progress"
          value={session.activePlayers}
          max={session.maxPlayers}
          aria-label="Player capacity"
        />
        {session.participants.length ? (
          <ul className="simulation-roster">
            {session.participants.map((player, index) => (
              <li key={player.id}>
                <span className="player-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="player-name">{player.name}</span>
                <span className="player-presence">Connected</span>
                {canChange && (
                  <button
                    className="secondary-button"
                    disabled={busy}
                    aria-label={`Remove ${player.name}`}
                    onClick={() =>
                      run(`/players/${player.id}/leave`, {}, 'Player left the session.')
                    }
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="simulation-empty">
            {session.state === 'ENDED'
              ? 'All players have disconnected. This session is read-only.'
              : session.state === 'RUNNING'
                ? 'No players remain connected. End the session when the test is complete.'
                : 'The lobby is empty. Add your first test player.'}
          </p>
        )}
        {canChange && session.state === 'LOBBY' && (
          <form className="simulation-join" onSubmit={add}>
            <div className="form-field">
              <label htmlFor="player-name">Player name</label>
              <input
                id="player-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={40}
                disabled={busy || session.activePlayers >= session.maxPlayers}
                placeholder="Player callsign"
              />
            </div>
            <button
              className="secondary-button"
              disabled={busy || session.activePlayers >= session.maxPlayers}
            >
              Add player
            </button>
          </form>
        )}
        {canChange && (
          <div className="simulation-actions">
            {session.state === 'LOBBY' ? (
              <>
                <p className="field-hint">
                  {session.activePlayers < 2
                    ? 'Add at least two players to start.'
                    : 'Ready to start. Starting closes the lobby to new players.'}
                </p>
                <div className="project-form-actions">
                  <button
                    className="primary-button"
                    disabled={busy || session.activePlayers < 2}
                    onClick={() => run('/start', {}, 'Session started. New joins are closed.')}
                  >
                    Start session <span aria-hidden="true">→</span>
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => run('/cancel', {}, 'Lobby cancelled. All players disconnected.')}
                  >
                    Cancel lobby
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="field-hint">
                  The session keeps running if players leave. Ending disconnects all remaining
                  players.
                </p>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => run('/end', {}, 'Session ended. All players disconnected.')}
                >
                  End session
                </button>
              </>
            )}
          </div>
        )}
        {archived && (
          <p className="archive-notice">
            This project is archived. Restore it from project details to create new sessions.
          </p>
        )}
      </section>
      <aside className="editor-note">
        <p className="eyebrow">THE SESSION LIFECYCLE</p>
        <h2>From lobby to wrap-up.</h2>
        <ol className="simulation-steps">
          <li>
            <strong>Lobby</strong>
            <p>
              Add {session.maxPlayers === 2 ? 'two' : `2–${session.maxPlayers}`} players, then
              start. You can cancel an unused lobby.
            </p>
          </li>
          <li>
            <strong>Running</strong>
            <p>Remove players to simulate departures. New joins are closed.</p>
          </li>
          <li>
            <strong>Ended</strong>
            <p>The final state is preserved. Create a fresh lobby for another test.</p>
          </li>
        </ol>
        <p>This is a REST-based simulation, without a game server or real network connections.</p>
        <dl className="simulation-times">
          <dt>Started (UTC)</dt>
          <dd>
            {session.startedAt
              ? new Date(session.startedAt).toISOString().replace('T', ' ').slice(0, 19)
              : 'Not started'}
          </dd>
          <dt>Ended (UTC)</dt>
          <dd>
            {session.endedAt
              ? new Date(session.endedAt).toISOString().replace('T', ' ').slice(0, 19)
              : 'Not ended'}
          </dd>
        </dl>
      </aside>
    </>
  );
}
