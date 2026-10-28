import type { Request } from 'express';

export interface SessionUser {
  id: string;
  email: string;
  createdAt: string;
}
export interface AuthRequest extends Request {
  user?: SessionUser;
  requestId?: string;
}

export function readCookie(request: Request, name: string): string | undefined {
  const value: unknown = request.cookies?.[name];
  return typeof value === 'string' ? value : undefined;
}
