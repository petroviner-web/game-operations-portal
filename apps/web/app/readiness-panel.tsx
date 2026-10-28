'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type HealthState = {
  status: 'checking' | 'ready' | 'database-down' | 'api-down';
  checkedAt: Date | null;
};

async function requestHealth(request: AbortController): Promise<HealthState> {
  const timeout = setTimeout(() => request.abort(new Error('Request timed out')), 5000);
  try {
    const response = await fetch('/api/v1/health/ready', {
      cache: 'no-store',
      signal: request.signal,
    });
    const body = await response.json();
    if (
      response.status === 200 &&
      body.service === 'game-ops-api' &&
      body.status === 'ok' &&
      body.checks?.database === 'up'
    ) {
      return { status: 'ready', checkedAt: new Date() };
    } else if (
      response.status === 503 &&
      body.service === 'game-ops-api' &&
      body.status === 'unavailable' &&
      body.checks?.database === 'down'
    ) {
      return { status: 'database-down', checkedAt: new Date() };
    } else {
      return { status: 'api-down', checkedAt: new Date() };
    }
  } catch {
    return { status: 'api-down', checkedAt: new Date() };
  } finally {
    clearTimeout(timeout);
  }
}

export function ReadinessPanel() {
  const [health, setHealth] = useState<HealthState>({ status: 'checking', checkedAt: null });
  const controller = useRef<AbortController | null>(null);

  const check = useCallback(() => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    return requestHealth(request).then((result) => {
      if (controller.current === request) setHealth(result);
    });
  }, []);

  useEffect(() => {
    void check();
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
  }, [check]);

  const checking = health.status === 'checking';
  const ready = health.status === 'ready';
  const apiUp = ready || health.status === 'database-down';
  const title = checking
    ? 'Checking your environment'
    : ready
      ? 'Your workspace is ready'
      : health.status === 'database-down'
        ? 'Your database needs attention'
        : 'Waiting for your API';
  const description = checking
    ? 'Connecting to the API and checking the database schema.'
    : ready
      ? 'The API and database are ready. Sign in to manage projects, simulate sessions, and explore analytics.'
      : health.status === 'database-down'
        ? 'The API is responding, but the database is not ready. Wait a moment and check again. If this continues, contact the portal owner.'
        : 'The service may be starting or temporarily unavailable. Wait a moment and check again. If this continues, contact the portal owner.';

  return (
    <section className="health-panel" aria-labelledby="health-title">
      <div className="health-main">
        <div className="health-kicker">
          <span className={`status-dot ${ready ? 'green' : checking ? '' : 'amber'}`} />
          <span>ENVIRONMENT STATUS</span>
          <span className="live-tag">{checking ? 'CHECKING' : 'LIVE CHECK'}</span>
        </div>
        <div role="status" aria-live="polite" aria-atomic="true">
          <h2 id="health-title">{title}</h2>
          <p className="health-description">{description}</p>
        </div>
        <div className="service-list">
          <div className="service-row">
            <div>
              <span className="service-icon" aria-hidden="true">
                01
              </span>
              <strong>Web application</strong>
              <span className="service-tech">Next.js</span>
            </div>
            <span className="service-state good">Available</span>
          </div>
          <div className="service-row">
            <div>
              <span className="service-icon" aria-hidden="true">
                02
              </span>
              <strong>REST API</strong>
              <span className="service-tech">NestJS</span>
            </div>
            <span className={`service-state ${apiUp ? 'good' : ''}`}>
              {checking ? 'Checking…' : apiUp ? 'Available' : 'Unreachable'}
            </span>
          </div>
          <div className="service-row">
            <div>
              <span className="service-icon" aria-hidden="true">
                03
              </span>
              <strong>Database & schema</strong>
              <span className="service-tech">PostgreSQL</span>
            </div>
            <span className={`service-state ${ready ? 'good' : ''}`}>
              {checking
                ? 'Checking…'
                : ready
                  ? 'Ready'
                  : health.status === 'database-down'
                    ? 'Not ready'
                    : 'Unknown'}
            </span>
          </div>
        </div>
        <div className="health-actions">
          <button
            type="button"
            onClick={() => {
              setHealth({ status: 'checking', checkedAt: null });
              void check();
            }}
            disabled={checking}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M20 7v5h-5M4 17v-5h5" />
              <path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" />
            </svg>
            {checking ? 'Checking…' : 'Check again'}
          </button>
          <span className="last-checked">
            {health.checkedAt
              ? `Checked ${health.checkedAt.toLocaleTimeString()}`
              : 'Waiting for response'}
          </span>
        </div>
      </div>
      <aside className="connection-card" aria-label="Connection path">
        <div className="small-label">THE CONNECTION PATH</div>
        <div className="connection-flow">
          <div>
            <span className="node-square">W</span>
            <span>
              Web client<small>Your browser</small>
            </span>
          </div>
          <div className="connector">
            <span>HTTP / SAME ORIGIN</span>
          </div>
          <div>
            <span className="node-square">A</span>
            <span>
              Application API<small>Business logic lives here</small>
            </span>
          </div>
          <div className="connector">
            <span>SQL / CONNECTION POOL</span>
          </div>
          <div>
            <span className="node-square">D</span>
            <span>
              PostgreSQL<small>Persistent application data</small>
            </span>
          </div>
        </div>
        <p className="connection-note">Each layer has one clear responsibility.</p>
      </aside>
    </section>
  );
}
