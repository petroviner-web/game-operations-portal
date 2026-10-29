import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApi } from '../../../../../lib/server-api';
import {
  formatDuration,
  recentAnalyticsRange,
  type ProjectAnalytics,
} from '../../../../../lib/analytics';
import { AnalyticsRangeForm } from '../../../../components/analytics-range-form';
import { AnalyticsChart } from '../../../../components/analytics-chart';
export const metadata = { title: 'Project analytics / GameOpen' };
export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const input = await searchParams;
  const base = `/workspace/projects/${id}/analytics`;
  const fallback = recentAnalyticsRange(7);
  const shapeValid = Object.entries(input).every(
    ([key, value]) => ['from', 'to'].includes(key) && typeof value === 'string',
  );
  const query = new URLSearchParams();
  for (const key of ['from', 'to']) if (typeof input[key] === 'string') query.set(key, input[key]);
  const response = shapeValid
    ? await serverApi(`/projects/${id}/analytics${query.size ? `?${query}` : ''}`)
    : null;
  if (response?.status === 404) notFound();
  const invalid = !shapeValid || response?.status === 400;
  const data = response?.ok ? ((await response.json()) as ProjectAnalytics) : null;
  const from = data?.range.from ?? (typeof input.from === 'string' ? input.from : fallback.from);
  const to = data?.range.to ?? (typeof input.to === 'string' ? input.to : fallback.to);
  const retry = base + (query.size ? `?${query}` : '');
  return (
    <>
      <Link className="project-back" href={`/workspace/projects/${id}`}>
        ← Project details
      </Link>
      <div className="workspace-title project-title">
        <div>
          <p className="eyebrow">{data?.project.name ?? 'YOUR PROJECT'} / ANALYTICS</p>
          <h1>
            From playtest to insight<span>.</span>
          </h1>
          <p className="intro">Understand session activity, one UTC day at a time.</p>
        </div>
        <a className="secondary-button" href={retry}>
          Refresh analytics
        </a>
      </div>
      {data?.project.state === 'archived' && (
        <p className="archive-notice">Archived project · historical analytics remain available.</p>
      )}
      <nav className="analytics-presets" aria-label="Analytics periods">
        {[7, 30].map((days) => {
          const range = recentAnalyticsRange(days);
          return (
            <a
              className="secondary-button"
              key={days}
              href={`${base}?from=${range.from}&to=${range.to}`}
            >
              Last {days} days
            </a>
          );
        })}
        <span>Includes today so far · UTC</span>
      </nav>
      <AnalyticsRangeForm
        action={base}
        from={from}
        to={to}
        error={
          invalid
            ? 'Choose valid YYYY-MM-DD dates with From before Until, spanning 1–90 days. Both dates are required.'
            : undefined
        }
      />
      {!invalid && !data && (
        <section className="project-empty" role="status">
          <h2>Analytics are unavailable.</h2>
          <p>We could not load the metrics. Your project data has not changed.</p>
          <a className="primary-button" href={retry}>
            Try again
          </a>
        </section>
      )}
      {data && (
        <>
          <section aria-labelledby="period-heading" className="analytics-period">
            <div className="analytics-section-heading">
              <div>
                <p className="eyebrow">SELECTED PERIOD</p>
                <h2 id="period-heading">Session activity</h2>
              </div>
              <p className="field-hint">
                {data.range.from} ≤ time &lt; {data.range.to} · UTC
              </p>
            </div>
            <div className="analytics-metrics">
              {[
                {
                  key: 'created',
                  label: 'Sessions created',
                  value: data.summary.createdSessions,
                  hint: 'Created during the selected period.',
                },
                {
                  key: 'started',
                  label: 'Sessions started',
                  value: data.summary.startedSessions,
                  hint: 'Started during the selected period.',
                },
                {
                  key: 'completed',
                  label: 'Sessions completed',
                  value: data.summary.completedSessions,
                  hint: 'Finished during the period; cancellations excluded.',
                },
                {
                  key: 'duration',
                  label: 'Average duration',
                  value: formatDuration(data.summary.averageDurationSeconds),
                  hint:
                    data.summary.averageDurationSeconds === null
                      ? 'No completed sessions in this period.'
                      : 'Full duration of sessions completed in this period.',
                },
              ].map((metric) => (
                <article className="analytics-metric" key={metric.key} aria-label={metric.label}>
                  <h3>{metric.label}</h3>
                  <strong data-testid={`metric-${metric.key}`}>{metric.value}</strong>
                  <p>{metric.hint}</p>
                </article>
              ))}
            </div>
          </section>
          <AnalyticsChart days={data.dailyStarts} />
          <section className="analytics-current" aria-labelledby="current-heading">
            <div className="analytics-section-heading">
              <div>
                <p className="eyebrow">CURRENT SNAPSHOT</p>
                <h2 id="current-heading">At the last refresh</h2>
              </div>
              <p className="field-hint">Independent of your selected dates.</p>
            </div>
            <div className="analytics-current-grid">
              <article className="analytics-metric" aria-label="Running sessions">
                <h3>Running sessions</h3>
                <strong data-testid="metric-running">{data.current.runningSessions}</strong>
                <p>Sessions currently in the RUNNING state.</p>
              </article>
              <article className="analytics-metric" aria-label="Connected test players">
                <h3>Connected test players</h3>
                <strong data-testid="metric-players">{data.current.activePlayers}</strong>
                <p>Active connections across lobbies and running sessions.</p>
              </article>
            </div>
            <p className="analytics-snapshot-time">
              Snapshot:{' '}
              <time dateTime={data.generatedAt}>
                {new Date(data.generatedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC
              </time>
              . Refresh to update.
            </p>
          </section>
          <aside className="analytics-note">
            <h2>What these numbers mean</h2>
            <p>
              Starts and completions count different events, so their totals may differ. Average
              duration includes the entire run of each completed session, even if it started before
              the selected period. Cancelled lobbies do not contribute to duration.
            </p>
            <p>
              These metrics describe simulated sessions and connections. They do not measure unique
              people, network latency, or gameplay performance.
            </p>
            <Link className="secondary-button" href={`/workspace/projects/${id}/sessions`}>
              Open multiplayer sessions <span aria-hidden="true">↗</span>
            </Link>
          </aside>
        </>
      )}
    </>
  );
}
