import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthRequest, readCookie } from './auth.types';
import { readAuthConfig } from './auth.config';
import { PUBLIC_ROUTE } from './public.decorator';

@Injectable()
export class SessionGuard implements CanActivate {
  private readonly config = readAuthConfig();
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = await this.auth.currentUser(readCookie(request, this.config.sessionCookie));
    if (!user)
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Please sign in to continue.',
      });
    request.user = user;
    return true;
  }
}
