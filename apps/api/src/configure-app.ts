import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  INestApplication,
  Logger,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import type { Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import type { AuthRequest } from './auth/auth.types';

@Catch()
class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<AuthRequest>();
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const details = error instanceof HttpException ? error.getResponse() : null;
    if (status >= 500) this.logger.error(`Request failed (${request.requestId || 'unknown'}).`);
    response.status(status).json({
      statusCode: status,
      ...(details === null
        ? {
            code: 'SERVICE_ERROR',
            message: 'The service is temporarily unavailable. Please try again.',
          }
        : typeof details === 'object'
          ? details
          : { message: String(details || 'Request failed.') }),
      requestId: request.requestId,
    });
  }
}

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.use((request: AuthRequest, response: Response, next: () => void) => {
    request.requestId = randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  const parseJson = json({ limit: '8kb' });
  app.use((request: AuthRequest, response: Response, next: NextFunction) => {
    parseJson(request, response, (error?: unknown) => {
      const type = error && typeof error === 'object' && 'type' in error ? error.type : null;
      // Normalize parser errors before Nest wraps them and exposes parser messages.
      if (type === 'entity.parse.failed' || type === 'entity.too.large') {
        next(
          new HttpException(
            {
              code: 'INVALID_BODY',
              message:
                type === 'entity.parse.failed'
                  ? 'Send a valid JSON body.'
                  : 'Request body exceeds the 8 KB limit.',
            },
            type === 'entity.parse.failed' ? 400 : 413,
          ),
        );
      } else next(error);
    });
  });
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
}
