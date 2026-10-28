import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Call only with application-owned relative paths; never with user-supplied URLs.
export async function serverApi(path: string): Promise<Response | null> {
  const jar = await cookies();
  const name = process.env.NODE_ENV === 'production' ? '__Host-gameops_session' : 'gameops_session';
  const token = jar.get(name)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) redirect('/login');
  let response: Response;
  try {
    response = await fetch(`${process.env.API_ORIGIN || 'http://127.0.0.1:4000'}/api/v1${path}`, {
      headers: { Cookie: `${name}=${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return null;
  }
  // redirect throws; keep it outside the network-error catch.
  if (response.status === 401) redirect('/login');
  return response;
}
