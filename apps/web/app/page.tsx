import { ReadinessPanel } from './readiness-panel';
import Link from 'next/link';

const roadmap = [
  {
    number: '01',
    name: 'Foundation',
    detail: 'Workspace, database & service health',
    complete: true,
  },
  {
    number: '02',
    name: 'Authentication',
    detail: 'Accounts, sessions & access control',
    complete: true,
  },
  {
    number: '03',
    name: 'Game projects',
    detail: 'Your games, organized in one place',
    complete: true,
  },
  {
    number: '04',
    name: 'Multiplayer',
    detail: 'Lobbies, players & session lifecycle',
    complete: true,
  },
  { number: '05', name: 'Analytics', detail: 'Understand session activity', complete: true },
  {
    number: '06',
    name: 'Release',
    detail: 'Browser tests, deployment & request logs',
    complete: true,
  },
];

export default function Home() {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <Link className="brand" href="/" aria-label="GameOpen home">
          <span className="brand-mark" aria-hidden="true" />
          GameOpen<span className="brand-slash">/</span>
        </Link>
        <div className="workspace-label">DEVELOPER WORKSPACE</div>
        <nav>
          <Link href="/workspace">
            <span aria-hidden="true">↗</span> Your workspace
          </Link>
          <a className="nav-active" href="#main" aria-current="page">
            <span aria-hidden="true">◫</span> Overview{' '}
            <span className="nav-arrow" aria-hidden="true">
              ↗
            </span>
          </a>
          <a href="#roadmap">
            <span aria-hidden="true">≡</span> MVP milestones
          </a>
          <a href="/api/v1/health/ready" target="_blank" rel="noreferrer">
            <span aria-hidden="true">⌁</span> API response{' '}
            <span className="nav-arrow" aria-hidden="true">
              ↗
            </span>
          </a>
        </nav>
        <div className="sidebar-note">
          <span className="small-label">MVP COMPLETE</span>
          <p>
            Good games start
            <br />
            with solid foundations.
          </p>
          <div className="step-track" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <span className="muted">Built incrementally. Tested at every step.</span>
        </div>
        <div className="sidebar-footer">
          <span className="avatar">GO</span>
          <div>
            GameOpen<span>Portfolio demo</span>
          </div>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <span>
            Workspace <span className="breadcrumb-separator">/</span> <strong>Overview</strong>
          </span>
          <Link className="environment" href="/login">
            <span aria-hidden="true">◇</span> Sign in to GameOpen
          </Link>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR DEVELOPER CONSOLE</p>
              <h1>
                Build your next world<span>.</span>
              </h1>
              <p className="intro">
                One workspace for your game projects, multiplayer sessions, and insights.
              </p>
            </div>
            <span className="version">MVP / RELEASE</span>
          </div>
          <p className="intro onboarding-links">
            <Link href="/register">Create your account</Link> to start a project, or{' '}
            <Link href="/workspace">open your workspace</Link>.
          </p>
          <ReadinessPanel />
          <section className="roadmap-section" id="roadmap" aria-labelledby="roadmap-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">FROM FOUNDATION TO FIRST SESSION</p>
                <h2 id="roadmap-title">Built in six milestones</h2>
              </div>
              <span className="section-caption">Six focused milestones</span>
            </div>
            <div className="roadmap-grid">
              {roadmap.map((step) => (
                <article className="roadmap-card" key={step.number}>
                  <div className="card-top">
                    <span className="step-number">{step.number}</span>
                    <span className="phase phase-current">
                      {step.complete ? 'Complete' : 'Planned'}
                    </span>
                  </div>
                  <h3>{step.name}</h3>
                  <p>{step.detail}</p>
                </article>
              ))}
            </div>
          </section>
          <footer className="main-footer">
            <span>
              GAMEOPEN <span className="footer-dot">/</span> A developer portal portfolio demo
            </span>
            <span>
              Next.js <span>·</span> NestJS <span>·</span> PostgreSQL
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
