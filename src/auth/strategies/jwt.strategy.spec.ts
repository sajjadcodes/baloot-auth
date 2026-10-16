import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ACCESS_TOKEN_COOKIE } from '../auth.constants';
import { extractAccessToken, JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const secret = 'test-only-access-token-secret-32-characters';
  let strategy: JwtStrategy;

  beforeEach(() => {
    const config = new ConfigService({ JWT_ACCESS_SECRET: secret });
    strategy = new JwtStrategy(config);
  });

  it('maps valid user and client claims to the authenticated user', () => {
    expect(
      strategy.validate({ sub: 'user-123', clientId: 'client-123' }),
    ).toEqual({
      userId: 'user-123',
      clientId: 'client-123',
    });
  });

  it.each([
    null,
    {},
    { sub: '' },
    { sub: 123 },
    { sub: 'user-123' },
    { sub: 'user-123', clientId: '' },
    { sub: 'user-123', clientId: 123 },
  ])('rejects an invalid token payload: %p', (payload) => {
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });

  it('extracts access tokens from the HttpOnly cookie before a bearer header', () => {
    const request = {
      cookies: { [ACCESS_TOKEN_COOKIE]: 'cookie-token' },
      headers: { authorization: 'Bearer header-token' },
    } as unknown as Request;

    expect(extractAccessToken(request)).toBe('cookie-token');
  });

  it('supports bearer tokens when no access cookie is present', () => {
    const request = {
      headers: { authorization: 'Bearer header-token' },
    } as unknown as Request;

    expect(extractAccessToken(request)).toBe('header-token');
  });

  it('returns null when neither cookie nor bearer token is present', () => {
    expect(extractAccessToken({ headers: {} } as Request)).toBeNull();
  });
});
