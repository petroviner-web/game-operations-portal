import type { Metadata } from 'next';
import './globals.css';
import './auth.css';
import './projects.css';
import './sessions.css';
import './analytics.css';

export const metadata: Metadata = {
  title: 'GameOps / Developer console',
  description:
    'A developer workspace for game projects, multiplayer sessions, and operational analytics.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
