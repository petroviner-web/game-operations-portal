import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApi } from '../../../../lib/server-api';
import { engines, formatProjectDate, type Project } from '../../../../lib/projects';
import { ProjectUnavailable } from '../../../components/project-feedback';
import { ProjectLifecycle } from '../../../components/project-lifecycle';
import { ProjectMembers, type Member } from '../../../components/project-members';

export const metadata = { title: 'Project details / GameOpen' };
export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const response = await serverApi(`/projects/${encodeURIComponent(id)}`);
  if (response?.status === 404 || response?.status === 400) notFound();
  if (!response?.ok) return <ProjectUnavailable retry={`/workspace/projects/${id}`} />;
  const { project } = (await response.json()) as { project: Project };
  const membersResponse =
    project.role === 'owner'
      ? await serverApi(`/projects/${encodeURIComponent(id)}/members`)
      : null;
  const members = membersResponse?.ok
    ? ((await membersResponse.json()) as { members: Member[] }).members
    : null;
  return (
    <>
      <Link
        className="project-back"
        href={project.state === 'archived' ? '/workspace?state=archived' : '/workspace'}
      >
        ← All projects
      </Link>
      <div className="workspace-title project-title">
        <div>
          <p className="eyebrow">{engines[project.engine]}</p>
          <h1>
            {project.name}
            <span>.</span>
          </h1>
        </div>
        <div className="project-title-actions">
          <span className={`project-state ${project.state}`}>
            {project.state === 'active' ? 'Active' : 'Archived'}
          </span>
          <span className="project-state">{project.role === 'owner' ? 'Owner' : 'Developer'}</span>
          {project.state === 'active' && (
            <Link className="primary-button" href={`/workspace/projects/${id}/edit`}>
              Edit project <span aria-hidden="true">↗</span>
            </Link>
          )}
        </div>
      </div>
      {project.state === 'archived' && (
        <p className="archive-notice" role="status">
          This project is archived. Its details are preserved; restore it to make changes.
        </p>
      )}
      <section className="project-detail-grid" aria-label="Project details">
        <article className="project-brief">
          <p className="eyebrow">THE GAME BRIEF</p>
          <h2>About this project</h2>
          <p className="project-description">
            {project.description || 'No description yet. Add a short brief to capture your idea.'}
          </p>
        </article>
        <dl className="project-metadata">
          <div>
            <dt>Game engine</dt>
            <dd>{engines[project.engine]}</dd>
          </div>
          <div>
            <dt>Created (UTC)</dt>
            <dd>{formatProjectDate(project.createdAt)}</dd>
          </div>
          <div>
            <dt>Last updated (UTC)</dt>
            <dd>{formatProjectDate(project.updatedAt)}</dd>
          </div>
          {project.archivedAt && (
            <div>
              <dt>Archived (UTC)</dt>
              <dd>{formatProjectDate(project.archivedAt)}</dd>
            </div>
          )}
        </dl>
      </section>
      <section className="lifecycle-panel">
        <div>
          <h2>Multiplayer simulation</h2>
          <p>Create lobbies and test player joins, departures, and the session lifecycle.</p>
        </div>
        <Link className="primary-button" href={`/workspace/projects/${id}/sessions`}>
          Multiplayer sessions <span aria-hidden="true">↗</span>
        </Link>
      </section>
      <section className="lifecycle-panel">
        <div>
          <h2>Project analytics</h2>
          <p>Explore session activity, daily starts, and completed playtest durations.</p>
        </div>
        <Link className="primary-button" href={`/workspace/projects/${id}/analytics`}>
          View analytics <span aria-hidden="true">↗</span>
        </Link>
      </section>
      {project.role === 'owner' && (
        <ProjectMembers
          projectId={id}
          initialMembers={members}
          archived={project.state === 'archived'}
        />
      )}
      {project.role === 'owner' && <ProjectLifecycle project={project} />}
    </>
  );
}
