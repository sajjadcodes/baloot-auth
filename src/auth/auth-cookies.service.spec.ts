import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './auth.constants';
import { AuthCookiesService } from './auth-cookies.service';

describe('AuthCookiesService', () => {
  function createService(
    values: Record<string, string | number>,
  ): AuthCookiesService {
    return new AuthCookiesService(new ConfigService(values));
  }

  it('sets access and refresh tokens as scoped HttpOnly cookies', () => {
    const setCookie = jest.fn();
    const response = {
      cookie: setCookie,
    } as unknown as Response;
    const cookies = createService({
      NODE_ENV: 'development',
      AUTH_COOKIE_SAME_SITE: 'lax',
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_SESSION_TTL_SECONDS: 2592000,
    });

    cookies.setAuthenticationCookies(response, 'access-token', 'refresh-token');

    expect(setCookie).toHaveBeenNthCalledWith(
      1,
      ACCESS_TOKEN_COOKIE,
      'access-token',
      {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 900000,
      },
    );
    expect(setCookie).toHaveBeenNthCalledWith(
      2,
      REFRESH_TOKEN_COOKIE,
      'refresh-token',
      {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/auth',
        maxAge: 2592000000,
      },
    );
  });

  it('requires secure cookies in production and for SameSite=None', () => {
    const setCookie = jest.fn();
    const response = {
      cookie: setCookie,
    } as unknown as Response;
    const cookies = createService({
      NODE_ENV: 'production',
      AUTH_COOKIE_SAME_SITE: 'none',
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_SESSION_TTL_SECONDS: 2592000,
    });

    cookies.setAuthenticationCookies(response, 'access', 'refresh');

    expect(setCookie).toHaveBeenNthCalledWith(
      1,
      ACCESS_TOKEN_COOKIE,
      'access',
      expect.objectContaining({ secure: true, sameSite: 'none' }),
    );
    expect(setCookie).toHaveBeenNthCalledWith(
      2,
      REFRESH_TOKEN_COOKIE,
      'refresh',
      expect.objectContaining({ secure: true, sameSite: 'none' }),
    );
  });

  it('clears both cookies using their original scopes and security options', () => {
    const clearCookie = jest.fn();
    const response = {
      clearCookie,
    } as unknown as Response;
    const cookies = createService({
      NODE_ENV: 'production',
      AUTH_COOKIE_SAME_SITE: 'strict',
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_SESSION_TTL_SECONDS: 2592000,
    });

    cookies.clearAuthenticationCookies(response);

    expect(clearCookie).toHaveBeenNthCalledWith(1, ACCESS_TOKEN_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });
    expect(clearCookie).toHaveBeenNthCalledWith(2, REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/auth',
    });
  });
});
