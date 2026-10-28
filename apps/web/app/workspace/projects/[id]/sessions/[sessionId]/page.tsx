import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApi } from '../../../../../../lib/server-api';
import type { Project } from '../../../../../../lib/projects';
import type { SessionDetail } from '../../../../../../lib/sessions';
import { SessionSimulator } from '../../../../../components/session-simulator';
export const metadata = { title: 'Session simulator / GameOps' };
export default async function SimulatorPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;
  if (![id, sessionId].every((value) => /^[a-f0-9-]{36}$/i.test(value))) notFound();
  const [projectResponse, response] = await Promise.all([
    serverApi(`/projects/${id}`),
    serverApi(`/projects/${id}/sessions/${sessionId}`),
  ]);
  if ([projectResponse, response].some((value) => value?.status === 404 || value?.status === 400))
    notFound();
  if (!projectResponse?.ok || !response?.ok)
    return (
      <section className="project-empty">
        <h1>Session unavailable.</h1>
        <a className="secondary-button" href={`/workspace/projects/${id}/sessions/${sessionId}`}>
          Try again
        </a>
      </section>
    );
  const { project } = (await projectResponse.json()) as { project: Project };
  const { session } = (await response.json()) as { session: SessionDetail };
  return (
    <>
      <Link href={`/workspace/projects/${id}/sessions`} className="project-back">
        ← All sessions
      </Link>
      <div className="project-heading">
        <p className="eyebrow">{project.name} / MULTIPLAYER SIMULATION</p>
        <h1>
          {session.name}
          <span>.</span>
        </h1>
        <p className="intro">Explore the lifecycle with simulated players.</p>
      </div>
      <div className="project-editor">
        <SessionSimulator initial={session} archived={project.state === 'archived'} />
      </div>
    </>
  );
}
