import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApi } from '../../../../../lib/server-api';
import { ProjectUnavailable } from '../../../../components/project-feedback';

export const metadata = { title: 'Project activity / GameOpen' };
const labels: Record<string, string> = {
  'project.created': 'Project created',
  'project.updated': 'Project updated',
  'project.archived': 'Project archived',
  'project.restored': 'Project restored',
  'member.added': 'Developer added',
  'member.removed': 'Developer removed',
  'session.created': 'Lobby created',
  'session.started': 'Session started',
  'session.ended': 'Session ended',
  'session.cancelled': 'Lobby cancelled',
};
interface ActivityPage {
  items: {
    id: string;
    action: string;
    actorId: string | null;
    actorEmail: string | null;
    targetId: string | null;
    createdAt: string;
  }[];
  nextCursor: string | null;
}

export default async function Activity({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string | string[]; cursor?: string | string[] }>;
}) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const query = await searchParams;
  const base = `/workspace/projects/${id}/activity`;
  if (
    (query.action !== undefined &&
      (typeof query.action !== 'string' ||
        (query.action !== '' && !Object.hasOwn(labels, query.action)))) ||
    (query.cursor !== undefined &&
      (typeof query.cursor !== 'string' || !/^[a-f0-9-]{36}$/i.test(query.cursor)))
  ) {
    return (
      <section className="project-empty">
        <h1>This activity view isn’t available.</h1>
        <p>Choose a valid filter or return to the first page.</p>
        <Link className="primary-button" href={base}>
          Reset activity filters
        </Link>
      </section>
    );
  }
  const action = query.action as string | undefined;
  const filter = new URLSearchParams();
  if (action) filter.set('action', action);
  const first = `${base}?${filter}`;
  if (query.cursor) filter.set('cursor', query.cursor as string);
  const response = await serverApi(`/projects/${id}/activity?${filter}`);
  if (response?.status === 404) notFound();
  if (response?.status === 400)
    return (
      <section className="project-empty">
        <h1>This activity page has expired.</h1>
        <Link className="primary-button" href={first}>
          First page
        </Link>
      </section>
    );
  if (!response?.ok) return <ProjectUnavailable retry={`${base}?${filter}`} />;
  const page = (await response.json()) as ActivityPage;
  const next = new URLSearchParams(filter);
  if (page.nextCursor) next.set('cursor', page.nextCursor);
  return (
    <>
      <Link className="project-back" href={`/workspace/projects/${id}`}>
        ← Project details
      </Link>
      <div className="workspace-title">
        <div>
          <p className="eyebrow">PROJECT HISTORY / OWNER ACCESS</p>
          <h1>
            Activity log<span>.</span>
          </h1>
          <p className="intro">
            Who changed what, and when. Recorded from the moment activity logging was enabled.
          </p>
        </div>
        <a className="secondary-button" href={`${base}?${filter}`}>
          Refresh activity
        </a>
      </div>
      <form className="analytics-range activity-filter" action={base}>
        <div className="form-field">
          <label htmlFor="activity-action">Activity type</label>
          <select id="activity-action" name="action" defaultValue={action || ''}>
            <option value="">All activity</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button className="primary-button" type="submit">
          Apply filter
        </button>
        <Link className="secondary-button" href={base}>
          Reset
        </Link>
      </form>
      {page.items.length ? (
        <ol className="activity-list" aria-label="Recorded activity">
          {page.items.map((item) => (
            <li key={item.id}>
              <div className="activity-event">
                <span className="eyebrow">{item.action.split('.')[0]}</span>
                <h2>{labels[item.action] ?? item.action}</h2>
                <p>By {item.actorEmail ?? 'Deleted account'}</p>
                {item.targetId && (
                  <details>
                    <summary>View target ID</summary>
                    <code>{item.targetId}</code>
                  </details>
                )}
              </div>
              <time dateTime={item.createdAt}>
                {new Intl.DateTimeFormat('en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'medium',
                  timeZone: 'UTC',
                }).format(new Date(item.createdAt))}{' '}
                UTC
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <section className="project-empty">
          <h2>No activity to show.</h2>
          <p>
            {action
              ? 'No recorded events match this filter.'
              : 'Future project changes, membership updates and session transitions will appear here.'}
          </p>
        </section>
      )}
      <nav className="project-pagination" aria-label="Activity pages">
        {query.cursor && (
          <Link className="secondary-button" href={first}>
            First page
          </Link>
        )}
        {page.nextCursor && (
          <Link className="secondary-button" href={`${base}?${next}`}>
            Older activity →
          </Link>
        )}
      </nav>
    </>
  );
}
