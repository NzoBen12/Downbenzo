import { Body, Controller, Get, HttpCode, Inject, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { loadEnv } from '../config/env';
import type { Env } from '../config/env';
import { AuthService, ENV } from './auth.service';
import { Ctx, CurrentUser, Public } from './decorators';
import { RequestContext, AuthUser } from './auth.types';
import { CSRF_COOKIE, SESSION_COOKIE } from './guards';

const loginSchema = z.object({ identifier: z.string().min(1).max(200), password: z.string().min(1).max(200) });
type LoginDto = z.infer<typeof loginSchema>;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Throttle({ default: { limit: () => loadEnv().LOGIN_RATE_LIMIT_PER_MINUTE, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) dto: LoginDto,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.login(dto.identifier, dto.password, ctx);
    const maxAge = this.env.JWT_EXPIRES_IN_MINUTES * 60_000;
    const base = { sameSite: 'strict' as const, secure: this.env.COOKIE_SECURE, maxAge, path: '/' };
    const csrf = randomBytes(24).toString('hex');
    res.cookie(SESSION_COOKIE, token, { ...base, httpOnly: true });
    res.cookie(CSRF_COOKIE, csrf, { ...base, httpOnly: false });
    return { user, csrfToken: csrf };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.revokeSessions(user.id);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }
}
