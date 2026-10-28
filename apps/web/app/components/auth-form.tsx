'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { AuthError, authMutation } from '../../lib/auth-client';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const registering = mode === 'register';
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    const fieldErrors: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      fieldErrors.email = 'Enter a valid email address.';
    if (password.length < (registering ? 12 : 1))
      fieldErrors.password = registering ? 'Use at least 12 characters.' : 'Enter your password.';
    if (password.length > 128) fieldErrors.password = 'Use no more than 128 characters.';
    if (Object.keys(fieldErrors).length) {
      setError(new AuthError('Please check the highlighted fields.', fieldErrors));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await authMutation(mode, { email, password });
      // A full navigation discards cached anonymous/authenticated page state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- NestJS changes the cookie outside Next.js actions; discard the entire client router cache.
      window.location.assign('/workspace');
    } catch (failure) {
      setError(
        failure instanceof AuthError
          ? failure
          : new AuthError('Something went wrong. Please try again.'),
      );
      setBusy(false);
    }
  }

  return (
    <>
      <p className="eyebrow">
        {registering ? 'MAKE ROOM FOR YOUR NEXT IDEA' : 'YOUR WORKSPACE IS WAITING'}
      </p>
      <h1>
        {registering ? 'Create your account' : 'Welcome back'}
        <span>.</span>
      </h1>
      <p className="auth-intro">
        {registering
          ? 'Start building your developer workspace.'
          : 'Sign in to pick up where you left off.'}
      </p>
      <form className="auth-form" onSubmit={submit} noValidate aria-busy={busy}>
        {error && (
          <div className="form-error" role="alert" ref={errorRef} tabIndex={-1}>
            <strong>{error.message}</strong>
            {Object.entries(error.fieldErrors).map(([field, message]) => (
              <a href={`#${field}`} key={field}>
                {message}
              </a>
            ))}
          </div>
        )}
        <div className="form-field">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            placeholder="you@studio.com"
            disabled={busy}
            aria-invalid={Boolean(error?.fieldErrors.email)}
            aria-describedby={error?.fieldErrors.email ? 'email-error' : undefined}
          />
          {error?.fieldErrors.email && (
            <p className="field-error" id="email-error">
              {error.fieldErrors.email}
            </p>
          )}
        </div>
        <div className="form-field">
          <label htmlFor="password">Password</label>
          <div className="password-input">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={registering ? 'new-password' : 'current-password'}
              maxLength={128}
              disabled={busy}
              aria-invalid={Boolean(error?.fieldErrors.password)}
              aria-describedby={
                `${registering ? 'password-hint ' : ''}${error?.fieldErrors.password ? 'password-error' : ''}`.trim() ||
                undefined
              }
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {registering && (
            <p className="field-hint" id="password-hint">
              12–128 characters. A long, memorable passphrase works well.
            </p>
          )}
          {error?.fieldErrors.password && (
            <p className="field-error" id="password-error">
              {error.fieldErrors.password}
            </p>
          )}
        </div>
        <button className="primary-button auth-submit" type="submit" disabled={busy}>
          {busy
            ? registering
              ? 'Creating account…'
              : 'Signing in…'
            : registering
              ? 'Create account'
              : 'Sign in'}
          <span aria-hidden="true">→</span>
        </button>
        <p className="auth-switch">
          {registering ? 'Already have an account?' : 'New to GameOps?'}{' '}
          <Link href={registering ? '/login' : '/register'}>
            {registering ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
      </form>
      <p className="auth-footnote">
        {registering
          ? 'Use a password unique to this workspace.'
          : 'Your projects start with a secure workspace.'}
      </p>
    </>
  );
}
