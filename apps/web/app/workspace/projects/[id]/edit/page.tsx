import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApi } from '../../../../../lib/server-api';
import type { Project } from '../../../../../lib/projects';
import { ProjectForm } from '../../../../components/project-form';
import { ProjectUnavailable } from '../../../../components/project-feedback';

export const metadata = { title: 'Edit project / GameOps' };
export default async function EditProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const response = await serverApi(`/projects/${encodeURIComponent(id)}`);
  if (response?.status === 404 || response?.status === 400) notFound();
  if (!response?.ok) return <ProjectUnavailable retry={`/workspace/projects/${id}/edit`} />;
  const { project } = (await response.json()) as { project: Project };
  if (project.state === 'archived')
    return (
      <section className="project-empty">
        <h1>Restore before editing.</h1>
        <p>This project is archived. Restore it from its details page to make changes.</p>
        <Link className="primary-button" href={`/workspace/projects/${id}`}>
          View project
        </Link>
      </section>
    );
  return (
    <>
      <Link className="project-back" href={`/workspace/projects/${id}`}>
        ← Project details
      </Link>
      <div className="project-heading">
        <p className="eyebrow">REFINE YOUR IDEA</p>
        <h1>
          Edit project<span>.</span>
        </h1>
        <p className="intro">Update the brief for {project.name}.</p>
      </div>
      <div className="project-editor">
        <ProjectForm project={project} />
        <aside className="editor-note">
          <p className="eyebrow">KEEP YOUR WORK</p>
          <h2>Every change matters.</h2>
          <p>If another tab updates this project, we’ll ask you to reload before saving over it.</p>
        </aside>
      </div>
    </>
  );
}
