import Link from 'next/link';
import { ProjectForm } from '../../../components/project-form';

export const metadata = { title: 'New project / GameOpen' };
export default function NewProjectPage() {
  return (
    <>
      <Link className="project-back" href="/workspace">
        ← All projects
      </Link>
      <div className="project-heading">
        <p className="eyebrow">A NEW BEGINNING</p>
        <h1>
          Create a project<span>.</span>
        </h1>
        <p className="intro">Give your next world a name. You can refine the details later.</p>
      </div>
      <div className="project-editor">
        <ProjectForm />
        <aside className="editor-note">
          <span className="eyebrow">YOURS TO BUILD</span>
          <h2>Start with the idea.</h2>
          <p>Only you can view and manage this project.</p>
          <p>
            After creating your project, open Multiplayer sessions to test lobbies and player
            activity.
          </p>
        </aside>
      </div>
    </>
  );
}
