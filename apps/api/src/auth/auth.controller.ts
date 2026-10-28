import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { CsrfService } from './csrf.service';
import { AuthRequest, readCookie } from './auth.types';
import { readAuthConfig } from './auth.config';
import { Public } from './public.decorator';
import { RateLimitGuard } from './rate-limit.guard';
import { validateCredentials } from './auth.validation';

@Controller('auth')
export class AuthController {
  private readonly config = readAuthConfig();
  constructor(
    private readonly auth: AuthService,
    private readonly csrf: CsrfService,
  ) {}

  @Public()
  @Get('csrf')
  csrfToken(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    return { csrfToken: this.csrf.issue(request, response) };
  }

  @Public()
  @Post('register')
  @UseGuards(RateLimitGuard)
  async register(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { email, password } = validateCredentials(body, true);
    const result = await this.auth.register(
      email,
      password,
      readCookie(request, this.config.sessionCookie),
    );
    this.setSession(response, result);
    return { user: result.user };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  async login(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { email, password } = validateCredentials(body, false);
    const result = await this.auth.login(
      email,
      password,
      readCookie(request, this.config.sessionCookie),
    );
    this.setSession(response, result);
    return { user: result.user };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(readCookie(request, this.config.sessionCookie));
    response.clearCookie(this.config.sessionCookie, this.config.cookieOptions);
    response.clearCookie(this.config.csrfCookie, this.config.cookieOptions);
  }

  @Get('me') me(@Req() request: AuthRequest) {
    return { user: request.user };
  }

  private setSession(response: Response, session: { token: string; expiresAt: Date }) {
    response.cookie(this.config.sessionCookie, session.token, {
      ...this.config.cookieOptions,
      expires: session.expiresAt,
    });
    response.clearCookie(this.config.csrfCookie, this.config.cookieOptions);
  }
}
