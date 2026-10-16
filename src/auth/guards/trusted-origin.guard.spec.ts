import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { TrustedOriginGuard } from './trusted-origin.guard';

describe('TrustedOriginGuard', () => {
  const trustedOrigin = 'https://app.example.com';
  let guard: TrustedOriginGuard;

  function contextFor(
    origin?: string,
  ): Parameters<TrustedOriginGuard['canActivate']>[0] {
    const request = {
      get: (header: string) => (header === 'origin' ? origin : undefined),
    } as unknown as Request;

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as Parameters<TrustedOriginGuard['canActivate']>[0];
  }

  beforeEach(() => {
    guard = new TrustedOriginGuard(
      new ConfigService({ CORS_ORIGINS: [trustedOrigin] }),
    );
  });

  it('allows a request from a configured exact origin', () => {
    expect(guard.canActivate(contextFor(trustedOrigin))).toBe(true);
  });

  it.each([undefined, 'https://evil.example.com'])(
    'rejects a missing or untrusted origin: %s',
    (origin) => {
      expect(() => guard.canActivate(contextFor(origin))).toThrow(
        ForbiddenException,
      );
    },
  );
});
