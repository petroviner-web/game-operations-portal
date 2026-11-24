import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hash } from 'argon2';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { PASSWORD_OPTIONS } from './auth.service';
import { hashToken } from './csrf.service';
import { readAuthConfig } from './auth.config';
import { RateLimitGuard } from './rate-limit.guard';
import { Public } from './public.decorator';

@Controller('auth')
@UseGuards(RateLimitGuard)
export class RecoveryController {
  private readonly logger = new Logger(RecoveryController.name);
  constructor(private readonly db: DatabaseService) {}

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  async request(@Body() body: unknown) {
    const parsed = z
      .object({ email: z.string().trim().toLowerCase().max(254).email() })
      .strict()
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException('Enter a valid email address.');
    const key = process.env.RESEND_API_KEY;
    const from = process.env.PASSWORD_RESET_FROM;
    if (!key || !from)
      throw new ServiceUnavailableException('Password recovery is temporarily unavailable.');
    const token = randomBytes(32).toString('hex');
    const result = await this.db.query(
      "UPDATE users SET reset_digest=$1, reset_expires_at=now()+interval '30 minutes' WHERE email_normalized=$2 AND NOT suspended",
      [hashToken(token), parsed.data.email],
    );
    if (result.rowCount) {
      const link = readAuthConfig().origin + '/reset-password#' + token;
      void fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [parsed.data.email],
          subject: 'Reset your GameOpen password',
          text:
            'Open this link within 30 minutes to choose a new password:\n' +
            link +
            '\nIf you did not request this, ignore this email.',
        }),
        signal: AbortSignal.timeout(10000),
      })
        .then((response) => {
          if (!response.ok) this.logger.warn('Recovery email delivery failed.');
        })
        .catch(() => this.logger.warn('Recovery email delivery failed.'));
    }
    return { accepted: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  async reset(@Body() body: unknown) {
    const parsed = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(12).max(128) })
      .strict()
      .safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Use a valid link and a password of 12 to 128 characters.');
    const digest = hashToken(parsed.data.token);
    await this.db.transaction(async (client) => {
      const result = await client.query(
        'SELECT id FROM users WHERE reset_digest=$1 AND reset_expires_at>now() AND NOT suspended FOR UPDATE',
        [digest],
      );
      if (!result.rowCount)
        throw new BadRequestException(
          'This link has expired or was already used. Request a new one.',
        );
      const id = result.rows[0].id;
      await client.query(
        'UPDATE users SET password_hash=$1, reset_digest=NULL, reset_expires_at=NULL WHERE id=$2',
        [await hash(parsed.data.password, PASSWORD_OPTIONS), id],
      );
      await client.query('DELETE FROM auth_sessions WHERE user_id=$1', [id]);
    });
  }
}
