import 'server-only';
import { cookies } from 'next/headers';

export interface SessionUser {
  id: string;
  email: string;
  createdAt: string;
}
export async function getSession(): Promise<{ user: SessionUser | null; unavailable: boolean }> {
  const cookieStore = await cookies();
  const name = process.env.NODE_ENV === 'production' ? '__Host-gameops_session' : 'gameops_session';
  const token = cookieStore.get(name)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return { user: null, unavailable: false };
  try {
    const response = await fetch(
      `${process.env.API_ORIGIN || 'http://127.0.0.1:4000'}/api/v1/auth/me`,
      {
        headers: { Cookie: `${name}=${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    );
    if (response.status === 401) return { user: null, unavailable: false };
    if (!response.ok) return { user: null, unavailable: true };
    const body = await response.json();
    if (
      typeof body.user?.id !== 'string' ||
      typeof body.user?.email !== 'string' ||
      typeof body.user?.createdAt !== 'string'
    )
      return { user: null, unavailable: true };
    return { user: body.user, unavailable: false };
  } catch {
    return { user: null, unavailable: true };
  }
}
