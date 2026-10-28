import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import { DatabaseService } from '../database/database.service';
import { readAuthConfig } from './auth.config';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly config = readAuthConfig();
  constructor(private readonly db: DatabaseService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    // Never trust client-supplied X-Forwarded-For. The local Next.js proxy shares a peer limit.
    await this.consume(`peer:${request.socket.remoteAddress || 'unknown'}`, 100, response);
    const email: unknown = request.body?.email;
    if (typeof email === 'string' && email.length <= 254) {
      await this.consume(`account:${email.trim().toLowerCase()}`, 10, response);
    }
    return true;
  }

  private async consume(key: string, limit: number, response: Response) {
    const hash = createHmac('sha256', this.config.secret).update(key).digest('hex');
    const result = await this.db.query<{ attempts: number; retry_after: number }>(
      `
      INSERT INTO auth_rate_limits (key_hash, attempts, resets_at)
      VALUES ($1, 1, now() + interval '15 minutes')
      ON CONFLICT (key_hash) DO UPDATE SET
        attempts = CASE WHEN auth_rate_limits.resets_at <= now() THEN 1 ELSE LEAST(auth_rate_limits.attempts + 1, 10001) END,
        resets_at = CASE WHEN auth_rate_limits.resets_at <= now() THEN now() + interval '15 minutes' ELSE auth_rate_limits.resets_at END
      RETURNING attempts, GREATEST(1, CEIL(EXTRACT(EPOCH FROM resets_at - now())))::int AS retry_after`,
      [hash],
    );
    const row = result.rows[0]!;
    if (row.attempts > limit) {
      response.setHeader('Retry-After', String(row.retry_after));
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Please try again later.',
          retryAfter: row.retry_after,
        },
        429,
      );
    }
  }
}
