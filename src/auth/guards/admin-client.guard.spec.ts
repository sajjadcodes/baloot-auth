import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { CLIENT_ID_HEADER } from '../auth.constants.js';
import type { AuthenticatedUser } from '../strategies/jwt.strategy.js';
import { AdminClientGuard } from './admin-client.guard.js';

describe('AdminClientGuard', () => {
  const tokenClientId = '00000000-0000-4000-8000-000000000001';
  const guard = new AdminClientGuard();

  function contextFor(
    authenticatedUser?: AuthenticatedUser,
    requestClientId?: string,
  ): ExecutionContext {
    const request = {
      user: authenticatedUser,
      get: (header: string) =>
        header === CLIENT_ID_HEADER ? requestClientId : undefined,
    } as unknown as Request & { user?: AuthenticatedUser };

    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  const invalidClientContexts: Array<
    [AuthenticatedUser | undefined, string | undefined]
  > = [
    [undefined, tokenClientId],
    [{ userId: 'admin-user', clientId: tokenClientId }, undefined],
    [
      { userId: 'admin-user', clientId: tokenClientId },
      '00000000-0000-4000-8000-000000000002',
    ],
  ];

  it('allows a request when the authenticated and requested clients match', () => {
    expect(
      guard.canActivate(
        contextFor(
          { userId: 'admin-user', clientId: tokenClientId },
          tokenClientId,
        ),
      ),
    ).toBe(true);
  });

  it.each(invalidClientContexts)(
    'rejects missing or mismatched client context: %p, %p',
    (authenticatedUser, requestClientId) => {
      expect(() =>
        guard.canActivate(contextFor(authenticatedUser, requestClientId)),
      ).toThrow(UnauthorizedException);
    },
  );
});
