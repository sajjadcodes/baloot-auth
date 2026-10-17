import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { PrismaService } from '../../database/prisma.service.js';
import { ACCESS_TOKEN_COOKIE } from '../auth.constants.js';
import { extractAccessToken, JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  const secret = 'test-only-access-token-secret-32-characters';
  const userId = '00000000-0000-4000-8000-000000000001';
  const clientId = '00000000-0000-4000-8000-000000000002';
  const sessionId = '00000000-0000-4000-8000-000000000003';
  let strategy: JwtStrategy;
  let findSession: jest.Mock;
  let findUser: jest.Mock;
  let whereSession: jest.Mock;
  let whereUser: jest.Mock;

  beforeEach(() => {
    findSession = jest.fn().mockResolvedValue({
      id: sessionId,
      userId,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      revokedAt: null,
    });
    findUser = jest.fn().mockResolvedValue({
      id: userId,
      clientId,
      status: 'ACTIVE',
      emailVerifiedAt: new Date().toISOString(),
    });
    whereSession = jest.fn(() => ({ first: findSession }));
    whereUser = jest.fn(() => ({ first: findUser }));

    const prisma = {
      public: {
        AuthSession: { where: whereSession },
        User: { where: whereUser },
      },
    } as unknown as PrismaService;
    strategy = new JwtStrategy(
      new ConfigService({ JWT_ACCESS_SECRET: secret }),
      prisma,
    );
  });

  it('accepts a valid token only while its account and session are active', async () => {
    await expect(
      strategy.validate({ sub: userId, clientId, sessionId }),
    ).resolves.toEqual({ userId, clientId, sessionId });

    expect(whereSession).toHaveBeenCalledWith({
      id: sessionId,
      userId,
      revokedAt: null,
    });
    expect(whereUser).toHaveBeenCalledWith({ id: userId, clientId });
  });

  it.each([
    null,
    {},
    { sub: '' },
    { sub: 123 },
    { sub: userId },
    { sub: userId, clientId: '' },
    { sub: userId, clientId: 123 },
    { sub: userId, clientId, sessionId: 'not-a-uuid' },
  ])('rejects an invalid token payload: %p', async (payload) => {
    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(findSession).not.toHaveBeenCalled();
  });

  it('rejects a revoked or expired session', async () => {
    findSession.mockResolvedValueOnce(null);
    await expect(
      strategy.validate({ sub: userId, clientId, sessionId }),
    ).rejects.toThrow(UnauthorizedException);

    findSession.mockResolvedValueOnce({
      id: sessionId,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await expect(
      strategy.validate({ sub: userId, clientId, sessionId }),
    ).rejects.toThrow(UnauthorizedException);
    expect(findUser).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing account', null],
    ['a disabled account', { id: userId, clientId, status: 'DISABLED' }],
    [
      'an unverified account',
      { id: userId, clientId, status: 'ACTIVE', emailVerifiedAt: null },
    ],
  ])('rejects %s', async (_description, user) => {
    findUser.mockResolvedValue(user);

    await expect(
      strategy.validate({ sub: userId, clientId, sessionId }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('extracts access tokens from the HttpOnly cookie before a bearer header', () => {
    const request = {
      cookies: { [ACCESS_TOKEN_COOKIE]: 'cookie-token' },
      headers: { authorization: '******' },
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
