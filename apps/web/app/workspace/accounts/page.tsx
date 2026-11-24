import { notFound } from 'next/navigation';
import { serverApi } from '../../../lib/server-api';
import { getSession } from '../../../lib/session';
import { StatusButton } from './status-button';

interface Account {
  id: string;
  email: string;
  suspended: boolean;
}

export default async function AccountsPage() {
  const { user } = await getSession();
  if (!user?.isAdmin) notFound();
  const response = await serverApi('/auth/accounts');
  if (!response?.ok) return <p role="alert">Unable to load accounts.</p>;
  const accounts: Account[] = await response.json();
  return (
    <section>
      <h1>Account management</h1>
      <ul>
        {accounts.map((account) => (
          <li key={account.id}>
            <strong>{account.email}</strong> � {account.suspended ? 'Suspended' : 'Active'}{' '}
            {account.id === user.id ? '(your account)' : <StatusButton {...account} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
