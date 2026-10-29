'use client';

import { useState, type FormEvent } from 'react';

export type Member = { id: string; email: string; role: 'developer'; createdAt: string };

export function ProjectMembers({
  projectId,
  initialMembers,
  archived,
}: {
  projectId: string;
  initialMembers: Member[] | null;
  archived: boolean;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/v1/projects/${encodeURIComponent(projectId)}/members`;
  async function refresh() {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Unable to refresh the member list.');
    setMembers((await response.json()).members as Member[]);
  }
  async function change(method: 'POST' | 'DELETE', memberId?: string) {
    setBusy(true);
    setMessage('');
    try {
      const csrf = await fetch('/api/v1/auth/csrf', {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!csrf.ok) throw new Error('Unable to verify the session.');
      const { csrfToken } = await csrf.json();
      const response = await fetch(
        `${endpoint}${memberId ? `/${encodeURIComponent(memberId)}` : ''}`,
        {
          method,
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
          ...(method === 'POST' ? { body: JSON.stringify({ email }) } : {}),
          signal: AbortSignal.timeout(15000),
          cache: 'no-store',
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          typeof body.message === 'string' ? body.message : 'Unable to update access.',
        );
      await refresh();
      if (method === 'POST') setEmail('');
      setMessage(body.message);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to confirm the change. Please refresh.',
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void change('POST');
  }
  return (
    <section className="project-members" aria-labelledby="members-title">
      <p className="eyebrow">PROJECT ACCESS</p>
      <h2 id="members-title">Developers</h2>
      <p>Give an existing GameOpen account access to edit this project and run simulations.</p>
      {archived && <p>Restore the project to add developers. You can still remove access.</p>}
      <form onSubmit={submit} className="members-form">
        <label htmlFor="member-email">Account email</label>
        <div>
          <input
            id="member-email"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy || archived}
          />
          <button className="primary-button" type="submit" disabled={busy || archived}>
            Add developer
          </button>
        </div>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {members === null ? (
        <p>Member list unavailable. Reload this page to try again.</p>
      ) : members.length === 0 ? (
        <p>No developers added yet.</p>
      ) : (
        <ul className="members-list">
          {members.map((member) => (
            <li key={member.id}>
              <span>
                {member.email} <small>Developer</small>
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void change('DELETE', member.id)}
                aria-label={`Remove access for ${member.email}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
