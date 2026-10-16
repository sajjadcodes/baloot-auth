import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response, CookieOptions } from 'express';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './auth.constants';

@Injectable()
export class AuthCookiesService {
  constructor(private readonly config: ConfigService) {}

  setAuthenticationCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    response.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...this.baseOptions(),
      path: '/',
      maxAge: this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS') * 1000,
    });
    response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...this.baseOptions(),
      path: '/auth',
      maxAge:
        this.config.getOrThrow<number>('REFRESH_SESSION_TTL_SECONDS') * 1000,
    });
  }

  clearAuthenticationCookies(response: Response): void {
    response.clearCookie(ACCESS_TOKEN_COOKIE, {
      ...this.baseOptions(),
      path: '/',
    });
    response.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...this.baseOptions(),
      path: '/auth',
    });
  }

  private baseOptions(): CookieOptions {
    const sameSite = this.config.getOrThrow<'lax' | 'strict' | 'none'>(
      'AUTH_COOKIE_SAME_SITE',
    );

    return {
      httpOnly: true,
      secure:
        this.config.getOrThrow<string>('NODE_ENV') === 'production' ||
        sameSite === 'none',
      sameSite,
    };
  }
}
