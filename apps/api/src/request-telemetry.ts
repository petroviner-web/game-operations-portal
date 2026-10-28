import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth/auth.types';

export interface RequestEvent {
  event: 'http_request';
  requestId: string;
  method: string;
  route: string;
  statusCode: number | null;
  durationMs: number;
  outcome: 'finished' | 'aborted';
}

const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

export function requestTelemetry(
  logger: Pick<Logger, 'log' | 'warn' | 'error'> = new Logger('HttpRequest'),
) {
  return (request: AuthRequest, response: Response, next: NextFunction) => {
    // Never trust an incoming correlation ID: it can contain personal data or log injection.
    const requestId = randomUUID();
    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    const started = performance.now();
    let recorded = false;
    const record = (outcome: RequestEvent['outcome']) => {
      if (recorded) return;
      recorded = true;
      response.off('finish', finished);
      response.off('close', closed);
      // Express's registered template is safe; originalUrl/path/params are user input.
      const route: unknown = request.route?.path;
      const event: RequestEvent = {
        event: 'http_request',
        requestId,
        method: methods.has(request.method) ? request.method : 'OTHER',
        route: typeof route === 'string' ? route : 'unmatched',
        statusCode: outcome === 'finished' ? response.statusCode : null,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        outcome,
      };
      if (event.statusCode !== null && event.statusCode >= 500) logger.error(event);
      else if (outcome === 'aborted' || (event.statusCode !== null && event.statusCode >= 400))
        logger.warn(event);
      else logger.log(event);
    };
    const finished = () => record('finished');
    const closed = () => record(response.writableFinished ? 'finished' : 'aborted');
    response.once('finish', finished);
    response.once('close', closed);
    next();
  };
}
