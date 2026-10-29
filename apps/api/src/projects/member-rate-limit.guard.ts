import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { Response } from 'express';
import { DatabaseService } from '../database/database.service';
import { readAuthConfig } from '../auth/auth.config';
import type { AuthRequest } from '../auth/auth.types';

@Injectable()
export class MemberRateLimitGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const key = createHmac('sha256', readAuthConfig().secret)
      .update(`project-member-add:${request.user!.id}`)
      .digest('hex');
    const result = await this.db.query<{ attempts: number; retry_after: number }>(
      `INSERT INTO auth_rate_limits(key_hash,attempts,resets_at) VALUES ($1,1,now()+interval '15 minutes')
       ON CONFLICT(key_hash) DO UPDATE SET
       attempts=CASE WHEN auth_rate_limits.resets_at<=now() THEN 1 ELSE LEAST(auth_rate_limits.attempts+1,10001) END,
       resets_at=CASE WHEN auth_rate_limits.resets_at<=now() THEN now()+interval '15 minutes' ELSE auth_rate_limits.resets_at END
       RETURNING attempts,GREATEST(1,CEIL(EXTRACT(EPOCH FROM resets_at-now())))::int AS retry_after`,
      [key],
    );
    if (result.rows[0]!.attempts > 20) {
      response.setHeader('Retry-After', String(result.rows[0]!.retry_after));
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
        429,
      );
    }
    return true;
  }
}
