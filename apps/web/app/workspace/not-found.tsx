import Link from 'next/link';
export default function ProjectNotFound() {
  return (
    <section className="project-empty">
      <p className="eyebrow">PROJECT UNAVAILABLE</p>
      <h1>Project not found.</h1>
      <p>This project doesn’t exist or isn’t available to your account.</p>
      <Link className="primary-button" href="/workspace">
        Back to projects
      </Link>
    </section>
  );
}
