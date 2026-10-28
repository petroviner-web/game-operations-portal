import type { ProjectAnalytics } from '../../lib/analytics';
export function AnalyticsChart({ days }: { days: ProjectAnalytics['dailyStarts'] }) {
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const peak = Math.max(...days.map((day) => day.count));
  const scale = Math.max(1, peak);
  const width = 760 / days.length;
  return (
    <section className="analytics-chart" aria-labelledby="daily-heading">
      <div className="analytics-chart-heading">
        <div>
          <p className="eyebrow">ACTIVITY OVER TIME</p>
          <h2 id="daily-heading">Daily session starts</h2>
        </div>
        <span className="analytics-chart-total">
          {total} starts / {days.length} UTC {days.length === 1 ? 'day' : 'days'}
        </span>
      </div>
      <p className="field-hint">
        {total === 0
          ? 'No sessions started in this period. Days with no starts are shown as zero.'
          : `Busiest day: ${peak} ${peak === 1 ? 'start' : 'starts'}. Each bar represents one UTC day.`}
      </p>
      <div className="analytics-scale">
        <span>Starts per day</span>
        <span>Scale: 0–{scale}</span>
      </div>
      <svg
        className="analytics-bars"
        viewBox="0 0 760 220"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${total} session starts over ${days.length} UTC days. Peak ${peak} starts in one day. Exact daily values are available in the table below.`}
      >
        {[0, 110, 219].map((y) => (
          <line
            key={y}
            x1="0"
            x2="760"
            y1={y}
            y2={y}
            className="analytics-gridline"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {days.map((day, i) => (
          <rect
            key={day.date}
            x={i * width + width * 0.16}
            y={219 - (day.count / scale) * 219}
            width={width * 0.68}
            height={(day.count / scale) * 219}
            rx={Math.min(3, width * 0.1)}
            className="analytics-bar"
          />
        ))}
      </svg>
      <div className="analytics-axis">
        <span>{days[0]?.date}</span>
        <span>{days.length > 1 ? days.at(-1)?.date : 'UTC'}</span>
      </div>
      <details className="analytics-table">
        <summary>View daily values</summary>
        <table>
          <caption>Session starts by UTC date</caption>
          <thead>
            <tr>
              <th scope="col">Date (UTC)</th>
              <th scope="col">Starts</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <th scope="row">{day.date}</th>
                <td>{day.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
