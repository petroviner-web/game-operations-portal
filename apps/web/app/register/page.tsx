import { redirect } from 'next/navigation';
import { getSession } from '../../lib/session';
import { AuthForm } from '../components/auth-form';
import { AuthShell } from '../components/auth-shell';

export const metadata = { title: 'Create account / GameOps' };
export default async function RegisterPage() {
  const session = await getSession();
  if (session.user) redirect('/workspace');
  return (
    <AuthShell>
      <AuthForm mode="register" />
    </AuthShell>
  );
}
