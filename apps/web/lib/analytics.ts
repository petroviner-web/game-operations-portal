export interface ProjectAnalytics {
  project: { id: string; name: string; state: 'active' | 'archived' };
  range: { from: string; to: string; timeZone: 'UTC'; endExclusive: true };
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
export function recentAnalyticsRange(days: number, now = new Date()) {
  const today = Date.parse(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  return {
    from: new Date(today - (days - 1) * 86400000).toISOString().slice(0, 10),
    to: new Date(today + 86400000).toISOString().slice(0, 10),
  };
}
export function formatDuration(seconds: number | null) {
  if (seconds === null) return '—';
  if (seconds < 60)
    return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(seconds)}s`;
  const rounded = Math.round(seconds);
  if (rounded < 3600) return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
  return `${Math.floor(rounded / 3600)}h ${Math.floor((rounded % 3600) / 60)}m`;
}
