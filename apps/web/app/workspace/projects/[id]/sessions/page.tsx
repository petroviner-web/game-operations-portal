import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApi } from '../../../../../lib/server-api';
import { type Project, formatProjectDate } from '../../../../../lib/projects';
import { type GameSession, sessionLabel } from '../../../../../lib/sessions';
import { SessionCreate } from '../../../../components/session-create';
export const metadata = { title: 'Multiplayer sessions / GameOpen' };
export default async function SessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const { cursor } = await searchParams;
  const base = `/workspace/projects/${id}/sessions`;
  if (cursor && (typeof cursor !== 'string' || !/^[a-f0-9-]{36}$/i.test(cursor)))
    return (
      <section className="project-empty">
        <h1>Invalid session page.</h1>
        <Link href={base}>Back to sessions</Link>
      </section>
    );
  const [projectResponse, response] = await Promise.all([
    serverApi(`/projects/${id}`),
    serverApi(`/projects/${id}/sessions${cursor ? `?cursor=${cursor}` : ''}`),
  ]);
  if (projectResponse?.status === 404 || projectResponse?.status === 400) notFound();
  if (!response?.ok || !projectResponse?.ok)
    return (
      <section className="project-empty">
        <h1>Sessions are unavailable.</h1>
        <p>
          {response?.status === 400
            ? 'This page link is invalid. Return to the first page.'
            : 'Please try again when the connection is restored.'}
        </p>
        <a className="secondary-button" href={base}>
          Reload sessions
        </a>
      </section>
    );
  const { project } = (await projectResponse.json()) as { project: Project };
  const page = (await response.json()) as { items: GameSession[]; nextCursor: string | null };
  return (
    <>
      <Link href={`/workspace/projects/${id}`} className="project-back">
        ← Project details
      </Link>
      <div className="project-heading">
        <p className="eyebrow">{project.name}</p>
        <h1>
          Multiplayer sessions<span>.</span>
        </h1>
        <p className="intro">
          Test the flow. Fill a lobby, start a session, and simulate player departures.
        </p>
      </div>
      {project.state === 'archived' && (
        <p className="archive-notice">Archived project · sessions are available for review.</p>
      )}
      <div className="simulation-list-layout">
        <section aria-label="Session list">
          <div className="project-list-caption">
            <span>YOUR SESSIONS</span>
            <span>Newest first · {page.items.length} on this page</span>
          </div>
          <div className="simulation-session-list">
            {page.items.length ? (
              page.items.map((session) => (
                <article className="project-card" key={session.id}>
                  <div className="project-card-top">
                    <span className="engine-label">
                      {session.activePlayers} / {session.maxPlayers} players
                    </span>
                    <span
                      className={`project-state ${session.state === 'ENDED' ? 'archived' : 'active'}`}
                    >
                      {sessionLabel(session)}
                    </span>
                  </div>
                  <h2>
                    <Link href={`${base}/${session.id}`}>
                      {session.name}
                      <span aria-hidden="true">↗</span>
                    </Link>
                  </h2>
                  <div className="project-card-footer">
                    Created {formatProjectDate(session.createdAt)} (UTC)
                  </div>
                </article>
              ))
            ) : (
              <div className="project-empty">
                <h2>No sessions yet.</h2>
                <p>Create a lobby to begin your first multiplayer simulation.</p>
              </div>
            )}
          </div>
          <nav className="project-pagination" aria-label="Session pages">
            {cursor && (
              <Link className="secondary-button" href={base}>
                First page
              </Link>
            )}
            {page.nextCursor && (
              <Link className="secondary-button" href={`${base}?cursor=${page.nextCursor}`}>
                Next sessions →
              </Link>
            )}
          </nav>
        </section>
        {project.state === 'active' && <SessionCreate projectId={id} />}
      </div>
    </>
  );
}
