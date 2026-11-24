'use client';
import { useState } from 'react';
import { authMutation } from '../../../lib/auth-client';

export function StatusButton({
  id,
  email,
  suspended,
}: {
  id: string;
  email: string;
  suspended: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function change() {
    if (!suspended && !window.confirm(`Suspend ${email} and sign them out?`)) return;
    setBusy(true);
    try {
      await authMutation(`accounts/${id}/status`, { suspended: !suspended });
      window.location.reload();
    } catch {
      setError('Unable to confirm this change. Refresh to check the account.');
      setBusy(false);
    }
  }
  return (
    <>
      <button className="secondary-button" disabled={busy} onClick={change}>
        {suspended ? 'Reactivate' : 'Suspend'}
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
