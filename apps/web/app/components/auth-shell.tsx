import Link from 'next/link';

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <aside className="auth-story">
        <Link className="brand" href="/" aria-label="GameOps home">
          <span className="brand-mark" aria-hidden="true">
            G<span>·</span>
          </span>
          GameOps<span className="brand-slash">/</span>
        </Link>
        <div className="auth-story-body">
          <p className="eyebrow">YOUR NEXT WORLD STARTS HERE</p>
          <h1>
            Big ideas.
            <br />A place to build<span>.</span>
          </h1>
          <p>A dedicated workspace for the games you’re making and the worlds you’re imagining.</p>
          <div className="auth-orbit" aria-hidden="true">
            <div className="orbit-ring" />
            <div className="orbit-center">
              G<span>·</span>
            </div>
            <span className="orbit-label orbit-label-top">CREATE</span>
            <span className="orbit-label orbit-label-bottom">EXPLORE</span>
          </div>
        </div>
        <p className="auth-story-footer">From the first idea to the next player.</p>
      </aside>
      <section className="auth-form-side">
        <div className="auth-form-container">{children}</div>
        <Link className="auth-back" href="/">
          ← Back to system overview
        </Link>
      </section>
    </main>
  );
}
