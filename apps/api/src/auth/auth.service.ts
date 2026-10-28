import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';
import { DatabaseService } from '../database/database.service';
import { hashToken } from './csrf.service';
import { readAuthConfig } from './auth.config';
import type { SessionUser } from './auth.types';

export const PASSWORD_OPTIONS = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
interface UserRow {
  id: string;
  email_normalized: string;
  created_at: Date;
  password_hash: string;
}
function publicUser(user: UserRow): SessionUser {
  return { id: user.id, email: user.email_normalized, createdAt: user.created_at.toISOString() };
}

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly config = readAuthConfig();
  private readonly logger = new Logger(AuthService.name);
  private dummyHash!: string;
  private cleanupTimer?: NodeJS.Timeout;
  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    this.dummyHash = await hash(randomBytes(32), PASSWORD_OPTIONS);
    this.cleanupTimer = setInterval(
      () => {
        void this.cleanup();
      },
      15 * 60 * 1000,
    );
    this.cleanupTimer.unref();
  }
  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
  private async cleanup() {
    try {
      await this.db.query('DELETE FROM auth_sessions WHERE expires_at <= now()');
      await this.db.query('DELETE FROM auth_rate_limits WHERE resets_at <= now()');
    } catch {
      this.logger.warn('Authentication record cleanup will retry at the next interval.');
    }
  }

  async register(email: string, password: string, previousToken?: string) {
    const passwordHash = await hash(password, PASSWORD_OPTIONS);
    return this.db.transaction(async (client) => {
      const result = await client.query<UserRow>(
        'INSERT INTO users (email_normalized, password_hash) VALUES ($1, $2) ON CONFLICT (email_normalized) DO NOTHING RETURNING *',
        [email, passwordHash],
      );
      const user = result.rows[0];
      if (!user)
        throw new ConflictException({
          code: 'REGISTRATION_FAILED',
          message: 'Unable to create this account. Try signing in instead.',
        });
      const session = await this.createSession(client, user.id, previousToken);
      return { user: publicUser(user), ...session };
    });
  }

  async login(email: string, password: string, previousToken?: string) {
    const result = await this.db.query<UserRow>('SELECT * FROM users WHERE email_normalized = $1', [
      email,
    ]);
    const user = result.rows[0];
    const valid = await verify(user?.password_hash || this.dummyHash, password);
    if (!user || !valid)
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
      });
    const session = await this.db.transaction((client) =>
      this.createSession(client, user.id, previousToken),
    );
    return { user: publicUser(user), ...session };
  }

  private async createSession(
    client: import('pg').PoolClient,
    userId: string,
    previousToken?: string,
  ) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.config.sessionTtlMs);
    if (previousToken && /^[a-f0-9]{64}$/.test(previousToken)) {
      await client.query('DELETE FROM auth_sessions WHERE token_hash = $1', [
        hashToken(previousToken),
      ]);
    }
    await client.query(
      'INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, hashToken(token), expiresAt],
    );
    return { token, expiresAt };
  }

  async currentUser(token?: string): Promise<SessionUser | null> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const result = await this.db.query<UserRow>(
      `
      SELECT u.id, u.email_normalized, u.created_at FROM users u
      JOIN auth_sessions s ON s.user_id = u.id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    );
    return result.rows[0] ? publicUser(result.rows[0]) : null;
  }
  async logout(token?: string) {
    if (token && /^[a-f0-9]{64}$/.test(token))
      await this.db.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashToken(token)]);
  }
}
