import Link from 'next/link';
import { serverApi } from '../../lib/server-api';
import { engines, formatProjectDate, type ProjectPage } from '../../lib/projects';
import { InvalidProjectPage, ProjectUnavailable } from '../components/project-feedback';

export const metadata = { title: 'Your projects / GameOpen' };
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[]; cursor?: string | string[] }>;
}) {
  const query = await searchParams;
  const state = query.state ?? 'active';
  const cursor = query.cursor;
  if (
    (state !== 'active' && state !== 'archived') ||
    (cursor !== undefined && (typeof cursor !== 'string' || !/^[a-f0-9-]{36}$/i.test(cursor)))
  )
    return <InvalidProjectPage />;
  const response = await serverApi(`/projects?state=${state}${cursor ? `&cursor=${cursor}` : ''}`);
  if (response?.status === 400) return <InvalidProjectPage />;
  if (!response?.ok)
    return (
      <ProjectUnavailable retry={`/workspace?state=${state}${cursor ? `&cursor=${cursor}` : ''}`} />
    );
  const page = (await response.json()) as ProjectPage;
  return (
    <>
      <div className="workspace-title">
        <div>
          <p className="eyebrow">YOUR LIBRARY / PROJECTS</p>
          <h1>
            Your projects<span>.</span>
          </h1>
          <p className="intro">A home for the worlds you’re building.</p>
        </div>
        <Link className="primary-button" href="/workspace/projects/new">
          New project <span aria-hidden="true">+</span>
        </Link>
      </div>
      <nav className="project-tabs" aria-label="Project status">
        <Link href="/workspace" aria-current={state === 'active' ? 'page' : undefined}>
          Active projects
        </Link>
        <Link
          href="/workspace?state=archived"
          aria-current={state === 'archived' ? 'page' : undefined}
        >
          Archived projects
        </Link>
      </nav>
      {page.items.length === 0 ? (
        <section className="project-empty">
          <div className="project-symbol" aria-hidden="true">
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            >
              <path d="M3 6h6l2 2h10v11H3z" />
              <path d="M12 11v5m-2.5-2.5h5" />
            </svg>
          </div>
          <h2>
            {cursor
              ? 'You’ve reached the end.'
              : state === 'active'
                ? 'Your first world starts here.'
                : 'Nothing archived yet.'}
          </h2>
          <p>
            {cursor
              ? 'Return to the first page for the latest projects.'
              : state === 'active'
                ? 'Create a project to keep your game’s idea, engine, and details together.'
                : 'Projects you set aside will appear here. You can restore them anytime.'}
          </p>
          <Link
            className="primary-button"
            href={
              cursor
                ? `/workspace?state=${state}`
                : state === 'active'
                  ? '/workspace/projects/new'
                  : '/workspace'
            }
          >
            {cursor
              ? 'First page'
              : state === 'active'
                ? 'Create your first project'
                : 'View active projects'}
          </Link>
        </section>
      ) : (
        <>
          <div className="project-list-caption">
            <span>{state === 'active' ? 'IN DEVELOPMENT' : 'ON THE SHELF'}</span>
            <span>Newest projects first</span>
          </div>
          <div className="project-grid">
            {page.items.map((project) => (
              <article className="project-card" key={project.id}>
                <div
                  className={`project-cover cover-${project.engine.toLowerCase()}`}
                  aria-hidden="true"
                >
                  <span className="cover-orbit" />
                  <span className="cover-engine">{engines[project.engine]}</span>
                  <span className="cover-label">
                    GAMEOPEN
                    <br />
                    PROJECT LIBRARY
                  </span>
                </div>
                <div className="project-card-top">
                  <span className="engine-label">{engines[project.engine]}</span>
                  <span className={`project-state ${project.state}`}>
                    {project.state === 'active' ? 'Active' : 'Archived'}
                  </span>
                </div>
                <h2>
                  <Link href={`/workspace/projects/${project.id}`}>
                    {project.name}
                    <span aria-hidden="true">↗</span>
                  </Link>
                </h2>
                <p className="project-card-description">
                  {project.description ||
                    'An idea waiting to take shape. Add a short brief to get started.'}
                </p>
                <div className="project-card-footer">
                  <span>Created {formatProjectDate(project.createdAt)}</span>
                  <span aria-hidden="true">
                    {project.engine === 'UNREAL' ? 'UE' : project.engine.slice(0, 2)}
                  </span>
                </div>
              </article>
            ))}
          </div>
          <nav className="project-pagination" aria-label="Project pages">
            {cursor && (
              <Link className="secondary-button" href={`/workspace?state=${state}`}>
                First page
              </Link>
            )}
            {page.nextCursor && (
              <Link
                className="secondary-button"
                href={`/workspace?state=${state}&cursor=${page.nextCursor}`}
              >
                Next page →
              </Link>
            )}
          </nav>
        </>
      )}
    </>
  );
}
