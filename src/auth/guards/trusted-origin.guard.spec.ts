import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { PrismaService } from '../../database/prisma.service.js';
import { CLIENT_ID_HEADER } from '../auth.constants.js';
import { TrustedOriginGuard } from './trusted-origin.guard.js';

describe('TrustedOriginGuard', () => {
  const trustedOrigin = 'https://app.example.com';
  const clientId = '00000000-0000-4000-8000-000000000001';
  let guard: TrustedOriginGuard;
  let findClient: jest.Mock;

  function contextFor(
    origin?: string,
    requestClientId?: string,
  ): Parameters<TrustedOriginGuard['canActivate']>[0] {
    const request = {
      get: (header: string) =>
        header === 'origin'
          ? origin
          : header === CLIENT_ID_HEADER
            ? requestClientId
            : undefined,
    } as unknown as Request;

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as Parameters<TrustedOriginGuard['canActivate']>[0];
  }

  beforeEach(() => {
    findClient = jest.fn().mockResolvedValue({
      status: 'ACTIVE',
      allowedOrigins: [{ origin: trustedOrigin }],
    });
    guard = new TrustedOriginGuard(
      new ConfigService({ CORS_ORIGINS: [trustedOrigin] }),
      {
        client: { findFirst: findClient },
      } as unknown as PrismaService,
    );
  });

  it('allows an active client from its configured exact origin', async () => {
    await expect(
      guard.canActivate(contextFor(trustedOrigin, clientId)),
    ).resolves.toBe(true);
    expect(findClient).toHaveBeenCalledWith({
      where: {
        id: clientId,
        status: 'ACTIVE',
        allowedOrigins: { some: { origin: trustedOrigin } },
      },
      include: { allowedOrigins: { where: { origin: trustedOrigin } } },
    });
  });

  it.each([
    [undefined, clientId],
    ['https://evil.example.com', clientId],
    [trustedOrigin, undefined],
    [trustedOrigin, 'not-a-uuid'],
  ])(
    'rejects invalid origin/client context: %s, %s',
    async (origin, requestClientId) => {
      await expect(
        guard.canActivate(contextFor(origin, requestClientId)),
      ).rejects.toThrow(ForbiddenException);
      expect(findClient).not.toHaveBeenCalled();
    },
  );

  it('rejects an unknown client', async () => {
    findClient.mockResolvedValue(null);

    await expect(
      guard.canActivate(contextFor(trustedOrigin, clientId)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a disabled client', async () => {
    findClient.mockResolvedValue(null);

    await expect(
      guard.canActivate(contextFor(trustedOrigin, clientId)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects an origin not assigned to the client', async () => {
    findClient.mockResolvedValue({ status: 'ACTIVE', allowedOrigins: [] });

    await expect(
      guard.canActivate(contextFor(trustedOrigin, clientId)),
    ).rejects.toThrow(ForbiddenException);
  });
});
