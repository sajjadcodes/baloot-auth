import 'reflect-metadata';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { PrismaService } from '../../database/prisma.service.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../strategies/jwt.strategy.js';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  const userId = 'user-1';
  const clientId = '00000000-0000-4000-8000-000000000001';
  const sessionId = '00000000-0000-4000-8000-000000000002';
  const user = {
    id: userId,
    clientId,
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
  };

  let guard: RolesGuard;
  let requiredRoles: string[] | undefined;
  let findUser: jest.Mock;
  let findAssignment: jest.Mock;
  let includeRole: jest.Mock;
  let whereRole: jest.Mock;
  let whereAssignment: jest.Mock;

  function contextFor(authenticatedUser?: AuthenticatedUser): ExecutionContext {
    const request = { user: authenticatedUser } as Request & {
      user?: AuthenticatedUser;
    };
    return {
      getHandler: () => RolesGuard.prototype.canActivate,
      getClass: () => RolesGuard,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    requiredRoles = ['user'];
    findUser = jest.fn().mockResolvedValue(user);
    findAssignment = jest.fn().mockResolvedValue({ userId });
    whereRole = jest.fn();
    whereAssignment = jest.fn().mockReturnThis();
    includeRole = jest.fn(
      (
        _relation: string,
        buildQuery: (query: { where: jest.Mock }) => unknown,
      ) => {
        buildQuery({ where: whereRole });
        return { where: whereAssignment, first: findAssignment };
      },
    );

    const reflector = {
      getAllAndOverride: jest.fn(() => requiredRoles),
    } as unknown as Reflector;
    guard = new RolesGuard(reflector, {
      user: { findFirst: jest.fn().mockImplementation(findUser) },
      userRole: {
        findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
          const role = where.role as { is: { name: string } };
          whereRole({ name: role.is.name });
          whereAssignment({ userId: where.userId });
          return findAssignment(role.is.name);
        }),
      },
    } as unknown as PrismaService);
  });

  it('allows an active verified user with a required role assignment', async () => {
    await expect(
      guard.canActivate(contextFor({ userId, clientId, sessionId })),
    ).resolves.toBe(true);

    expect(whereRole).toHaveBeenCalledWith({ name: 'user' });
    expect(whereAssignment).toHaveBeenCalledWith({ userId });
  });

  it('accepts any one of the required roles', async () => {
    requiredRoles = ['platform_admin', 'user'];
    findAssignment
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ role: { name: 'user' } });

    await expect(
      guard.canActivate(contextFor({ userId, clientId, sessionId })),
    ).resolves.toBe(true);
    expect(findAssignment).toHaveBeenCalledTimes(2);
  });

  it('rejects users without a matching role assignment', async () => {
    findAssignment.mockResolvedValue(null);

    await expect(
      guard.canActivate(contextFor({ userId, clientId, sessionId })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects empty role requirements', async () => {
    requiredRoles = [];

    await expect(
      guard.canActivate(contextFor({ userId, clientId, sessionId })),
    ).rejects.toThrow(ForbiddenException);
    expect(findAssignment).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing user', null],
    ['a disabled user', { ...user, status: 'DISABLED' }],
    ['an unverified user', { ...user, emailVerifiedAt: null }],
  ])(
    'rejects %s before checking role assignments',
    async (_case, foundUser) => {
      findUser.mockResolvedValue(foundUser);

      await expect(
        guard.canActivate(contextFor({ userId, clientId, sessionId })),
      ).rejects.toThrow(UnauthorizedException);
      expect(findAssignment).not.toHaveBeenCalled();
    },
  );

  it('rejects missing authenticated-user context', async () => {
    await expect(guard.canActivate(contextFor())).rejects.toThrow(
      UnauthorizedException,
    );
    expect(findUser).not.toHaveBeenCalled();
  });

  it('allows routes without role metadata', async () => {
    requiredRoles = undefined;

    await expect(guard.canActivate(contextFor())).resolves.toBe(true);
    expect(findUser).not.toHaveBeenCalled();
  });

  it('reads role metadata from method before class', async () => {
    const reflector = new Reflector();
    const handler = () => undefined;
    class Controller {
      route(): void {}
    }
    Reflect.defineMetadata(ROLES_KEY, ['class-role'], Controller);
    Reflect.defineMetadata(ROLES_KEY, ['method-role'], handler);

    expect(
      reflector.getAllAndOverride<string[]>(ROLES_KEY, [handler, Controller]),
    ).toEqual(['method-role']);
  });
});
