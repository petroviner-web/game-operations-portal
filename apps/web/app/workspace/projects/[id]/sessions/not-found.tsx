import Link from 'next/link';
export default function SessionNotFound() {
  return (
    <section className="project-empty">
      <p className="eyebrow">SESSION UNAVAILABLE</p>
      <h1>Session not found.</h1>
      <p>This project or session does not exist or is not available to your account.</p>
      <Link className="primary-button" href="/workspace">
        Back to projects
      </Link>
    </section>
  );
}
