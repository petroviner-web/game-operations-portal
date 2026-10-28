'use client';

import { useState } from 'react';
import { authMutation } from '../../lib/auth-client';

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setBusy(true);
    setError('');
    try {
      await authMutation('logout');
      window.location.replace('/login');
    } catch {
      setError('Sign out failed. Please try again.');
      setBusy(false);
    }
  }
  return (
    <div className="logout-control">
      <button
        className="secondary-button"
        type="button"
        onClick={() => void logout()}
        disabled={busy}
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
