import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { AnalyticsRange } from './analytics.validation';

export interface ProjectAnalytics {
  project: { id: string; name: string; state: 'active' | 'archived' };
  range: AnalyticsRange & { timeZone: 'UTC'; endExclusive: true };
  summary: {
    createdSessions: number;
    startedSessions: number;
    completedSessions: number;
    averageDurationSeconds: number | null;
  };
  current: { runningSessions: number; activePlayers: number };
  dailyStarts: { date: string; count: number }[];
  generatedAt: string;
}
@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DatabaseService) {}
  async get(owner: string, projectId: string, range: AnalyticsRange): Promise<ProjectAnalytics> {
    // One statement: ownership, aggregates, roster counts and timestamp share one MVCC snapshot.
    const result = await this.db.query<{ analytics: ProjectAnalytics }>(
      `
      WITH project AS (
        SELECT id, name, archived_at FROM projects p WHERE id=$2 AND (owner_id=$1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$1))
      ), sessions AS (
        SELECT s.* FROM game_sessions s JOIN project p ON p.id=s.project_id
      ), bounds AS (
        SELECT $3::date::timestamp AT TIME ZONE 'UTC' AS since,
               $4::date::timestamp AT TIME ZONE 'UTC' AS until
      ), totals AS (
        SELECT count(*) FILTER (WHERE created_at >= since AND created_at < until)::int AS created,
          count(*) FILTER (WHERE started_at >= since AND started_at < until)::int AS started,
          count(*) FILTER (WHERE end_reason='COMPLETED' AND ended_at >= since AND ended_at < until)::int AS completed,
          round(avg(extract(epoch FROM ended_at-started_at)) FILTER
            (WHERE end_reason='COMPLETED' AND ended_at >= since AND ended_at < until),3)::double precision AS duration,
          count(*) FILTER (WHERE state='RUNNING')::int AS running
        FROM sessions CROSS JOIN bounds
      ), daily AS (
        SELECT (started_at AT TIME ZONE 'UTC')::date AS day, count(*)::int AS count
        FROM sessions CROSS JOIN bounds WHERE started_at >= since AND started_at < until
        GROUP BY (started_at AT TIME ZONE 'UTC')::date
      ), calendar AS (
        SELECT $3::date + offset_day AS day FROM generate_series(0, ($4::date-$3::date)-1) AS offset_day
      )
      SELECT jsonb_build_object(
        'project', jsonb_build_object('id',p.id,'name',p.name,'state',CASE WHEN p.archived_at IS NULL THEN 'active' ELSE 'archived' END),
        'range', jsonb_build_object('from',$3::text,'to',$4::text,'timeZone','UTC','endExclusive',true),
        'summary', jsonb_build_object('createdSessions',t.created,'startedSessions',t.started,'completedSessions',t.completed,'averageDurationSeconds',t.duration),
        'current', jsonb_build_object('runningSessions',t.running,'activePlayers',
          (SELECT count(*)::int FROM session_participants sp JOIN sessions s ON s.id=sp.session_id
            WHERE sp.left_at IS NULL AND s.state IN ('LOBBY','RUNNING'))),
        'dailyStarts', (SELECT jsonb_agg(jsonb_build_object('date',to_char(c.day,'YYYY-MM-DD'),'count',COALESCE(d.count,0)) ORDER BY c.day)
          FROM calendar c LEFT JOIN daily d ON d.day=c.day),
        'generatedAt', to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS analytics FROM project p CROSS JOIN totals t`,
      [owner, projectId, range.from, range.to],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Project not found.' });
    return result.rows[0].analytics;
  }
}
