'use client';
import { useEffect, useRef } from 'react';
export function AnalyticsRangeForm({
  action,
  from,
  to,
  error,
}: {
  action: string;
  from: string;
  to: string;
  error?: string;
}) {
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  return (
    <form
      className="analytics-range"
      action={action}
      method="get"
      aria-label="Analytics date range"
    >
      {error && (
        <div
          className="form-error"
          role="alert"
          tabIndex={-1}
          ref={errorRef}
          id="analytics-range-error"
        >
          {error}
        </div>
      )}
      <div className="analytics-date-fields">
        <div className="form-field">
          <label htmlFor="analytics-from">From (UTC, included)</label>
          <input
            id="analytics-from"
            name="from"
            type="date"
            required
            defaultValue={from}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'analytics-range-error range-hint' : 'range-hint'}
          />
        </div>
        <div className="form-field">
          <label htmlFor="analytics-to">Until (UTC, excluded)</label>
          <input
            id="analytics-to"
            name="to"
            type="date"
            required
            defaultValue={to}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'analytics-range-error range-hint' : 'range-hint'}
          />
        </div>
        <button className="primary-button">
          Apply dates <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="field-hint" id="range-hint">
        1–90 days. Each boundary is midnight UTC. To include a day, set Until to the following day.
      </p>
    </form>
  );
}
