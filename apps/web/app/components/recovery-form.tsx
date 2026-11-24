'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { authMutation } from '../../lib/auth-client';

export function RecoveryForm({ mode }: { mode: 'forgot' | 'reset' }) {
  const reset = mode === 'reset';
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('value') ?? '');
    setBusy(true);
    setError('');
    try {
      if (reset) {
        const token = window.location.hash.slice(1);
        await authMutation('reset-password', { token, password: value });
        window.history.replaceState(null, '', window.location.pathname);
      } else await authMutation('forgot-password', { email: value });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>{reset ? 'Choose a new password' : 'Reset your password'}</h2>
      {done ? (
        <p role="status">
          {reset
            ? 'Your password has been changed. Sign in with your new password.'
            : 'If your account is eligible, you will receive a reset link by email.'}
        </p>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <div className="form-field">
            <label htmlFor="value">
              {reset ? 'New password (12�128 characters)' : 'Account email'}
            </label>
            <input
              id="value"
              name="value"
              type={reset ? 'password' : 'email'}
              autoComplete={reset ? 'new-password' : 'email'}
              required
              minLength={reset ? 12 : undefined}
              maxLength={reset ? 128 : 254}
            />
          </div>
          {error && <p role="alert">{error}</p>}
          <button className="primary-button" disabled={busy}>
            {reset ? 'Save new password' : 'Send reset link'}
          </button>
        </form>
      )}
      <p>
        <Link href="/login">Back to sign in</Link>
      </p>
      {reset && !done && <Link href="/forgot-password">Request another link</Link>}
    </>
  );
}
