import { redirect } from 'next/navigation';
import { getSession } from '../../lib/session';
import { AuthForm } from '../components/auth-form';
import { AuthShell } from '../components/auth-shell';

export const metadata = { title: 'Sign in / GameOpen' };
export default async function LoginPage() {
  const session = await getSession();
  if (session.user) redirect('/workspace');
  return (
    <AuthShell>
      <AuthForm mode="login" />
    </AuthShell>
  );
}
