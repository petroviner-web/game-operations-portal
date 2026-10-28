import Link from 'next/link';

export function ProjectUnavailable({ retry = '/workspace' }: { retry?: string }) {
  return (
    <section className="project-empty" role="status">
      <p className="eyebrow">TEMPORARILY UNAVAILABLE</p>
      <h1>We couldn’t load your projects.</h1>
      <p>Your data has not been changed. Check the connection and try again.</p>
      <a className="primary-button" href={retry}>
        Try again
      </a>
    </section>
  );
}
export function InvalidProjectPage() {
  return (
    <section className="project-empty">
      <h1>This project view isn’t available.</h1>
      <p>The filter or page link is invalid. Start from your current projects.</p>
      <Link className="primary-button" href="/workspace">
        Back to projects
      </Link>
    </section>
  );
}
