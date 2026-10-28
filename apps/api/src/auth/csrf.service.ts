import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { readAuthConfig } from './auth.config';
import { readCookie } from './auth.types';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function equalTokens(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

@Injectable()
export class CsrfService {
  private readonly config = readAuthConfig();

  assertOrigin(request: Request, required = true) {
    const origin = request.get('origin');
    if (
      request.get('sec-fetch-site') === 'cross-site' ||
      (origin ? origin !== this.config.origin : required)
    ) {
      throw new ForbiddenException({
        code: 'ORIGIN_REJECTED',
        message: 'This request origin is not allowed.',
      });
    }
  }

  private signature(nonce: string, time: string, session: string) {
    return createHmac('sha256', this.config.secret)
      .update(`${nonce}.${time}.${hashToken(session)}`)
      .digest('hex');
  }

  issue(request: Request, response: Response) {
    this.assertOrigin(request, false);
    // Reuse a valid token so concurrent tabs do not invalidate one another.
    const current = readCookie(request, this.config.csrfCookie);
    const token = current && this.valid(current, request) ? current : this.create(request);
    response.cookie(this.config.csrfCookie, token, {
      ...this.config.cookieOptions,
      maxAge: this.config.csrfTtlMs,
    });
    return token;
  }

  private create(request: Request) {
    const nonce = randomBytes(32).toString('hex');
    const time = String(Date.now());
    const session = readCookie(request, this.config.sessionCookie) || '';
    return `${nonce}.${time}.${this.signature(nonce, time, session)}`;
  }

  private valid(token: string, request: Request): boolean {
    const parts = /^([a-f0-9]{64})\.(\d{13})\.([a-f0-9]{64})$/.exec(token);
    if (!parts) return false;
    const [, nonce, time, signature] = parts;
    if (!nonce || !time || !signature) return false;
    const age = Date.now() - Number(time);
    if (age < 0 || age >= this.config.csrfTtlMs) return false;
    return equalTokens(
      signature,
      this.signature(nonce, time, readCookie(request, this.config.sessionCookie) || ''),
    );
  }

  assertToken(request: Request) {
    this.assertOrigin(request);
    const cookie = readCookie(request, this.config.csrfCookie);
    const header = request.get('x-csrf-token');
    if (
      !cookie ||
      !header ||
      header.length > 160 ||
      !equalTokens(cookie, header) ||
      !this.valid(header, request)
    ) {
      throw new ForbiddenException({
        code: 'CSRF_REJECTED',
        message: 'Your security token expired. Please try again.',
      });
    }
  }
}
