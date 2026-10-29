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
      <aside className="workspace-header" aria-label="Workspace navigation">
        <Link className="brand" href="/workspace">
          <span className="brand-mark" aria-hidden="true">
            G<span>·</span>
          </span>
          GameOps<span className="brand-slash">/</span>
        </Link>
        <div className="workspace-profile">
          <span className="workspace-profile-avatar" aria-hidden="true">
            G
          </span>
          <span>
            <strong>Developer account</strong>
            <small data-testid="account-email">{user.email}</small>
          </span>
        </div>
        <nav className="workspace-nav" aria-label="Main navigation">
          <span>WORKSPACE</span>
          <Link href="/workspace">
            <span aria-hidden="true">▦</span> Projects
          </Link>
          <Link href="/workspace/projects/new">
            <span aria-hidden="true">＋</span> Create project
          </Link>
          <Link href="/workspace?state=archived">
            <span aria-hidden="true">▣</span> Archived
          </Link>
          <span>GAMEOPS</span>
          <Link href="/">
            <span aria-hidden="true">◉</span> System overview
          </Link>
        </nav>
        <div className="workspace-header-actions">
          <LogoutButton />
        </div>
      </aside>
      <main className="workspace-main" id="workspace-main">
        <div className="workspace-account">
          <span className="eyebrow">GAMEOPS / DEVELOPER WORKSPACE</span>
          <span>Project library</span>
        </div>
        {children}
        <footer className="main-footer">
          <span>GAMEOPS / YOUR DEVELOPER WORKSPACE</span>
          <span>Build. Simulate. Understand.</span>
        </footer>
      </main>
    </div>
  );
}
