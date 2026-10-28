import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../lib/session';
import { LogoutButton } from '../components/logout-button';
import { ProjectUnavailable } from '../components/project-feedback';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { user, unavailable } = await getSession();
  if (unavailable)
    return (
      <main>
        <ProjectUnavailable />
      </main>
    );
  if (!user) redirect('/login');
  return (
    <div className="workspace-page">
      <a className="skip-link" href="#workspace-main">
        Skip to content
      </a>
      <header className="workspace-header">
        <Link className="brand" href="/workspace">
          <span className="brand-mark" aria-hidden="true">
            G<span>·</span>
          </span>
          GameOps<span className="brand-slash">/</span>
        </Link>
        <div className="workspace-header-actions">
          <Link href="/">System overview</Link>
          <LogoutButton />
        </div>
      </header>
      <main className="workspace-main" id="workspace-main">
        <div className="workspace-account">
          <span className="eyebrow">DEVELOPER WORKSPACE</span>
          <span data-testid="account-email">{user.email}</span>
        </div>
        {children}
        <footer className="main-footer">
          <span>GAMEOPS / YOUR DEVELOPER WORKSPACE</span>
          <span>Milestone 05 — Analytics</span>
        </footer>
      </main>
    </div>
  );
}
