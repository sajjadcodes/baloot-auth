import 'reflect-metadata';
import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma.service.js';
import { AccessTokenService } from './access-token.service.js';
import { AuthService } from './auth.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import { PasswordResetService } from './password-reset.service.js';

describe('AuthService', () => {
  const user = { id: 'user-1', email: 'person@example.com' };
  const role = { id: 'role-user' };
  const clientId = '00000000-0000-4000-8000-000000000001';

  let service: AuthService;
  let findUser: jest.Mock;
  let findRefreshUser: jest.Mock;
  let findRoleAssignment: jest.Mock;
  let includeRoleAssignment: jest.Mock;
  let updateUser: jest.Mock;
  let whereUser: jest.Mock;
  let findRefreshSession: jest.Mock;
  let whereRefreshSession: jest.Mock;
  let updateRefreshSession: jest.Mock;
  let updateAllRefreshSessions: jest.Mock;
  let findAuthSession: jest.Mock;
  let findAllAuthSessions: jest.Mock;
  let whereAuthSession: jest.Mock;
  let createAuthSession: jest.Mock;
  let updateAuthSession: jest.Mock;
  let updateAllAuthSessions: jest.Mock;
  let createAuditEvent: jest.Mock;
  let createUserRole: jest.Mock;
  let createRefreshSession: jest.Mock;
  let transaction: {
    orm: {
      public: {
        Role: { where: jest.Mock };
        User: { create: jest.Mock; where: jest.Mock };
        UserRole: { create: jest.Mock; where: jest.Mock };
        AuthSession: {
          create: jest.Mock;
          where: jest.Mock;
        };
        AdminAuditEvent: { create: jest.Mock };
        RefreshSession: {
          create: jest.Mock;
          where: jest.Mock;
        };
      };
    };
  };
  let transact: jest.Mock;
  let hashPassword: jest.Mock;
  let verifyPassword: jest.Mock;
  let issueAccessToken: jest.Mock;
  let sendVerificationEmail: jest.Mock;
  let verifyEmailToken: jest.Mock;
  let refreshSessionData:
    | {
        userId: string;
        sessionId: string;
        tokenHash: string;
        expiresAt: Date;
      }
    | undefined;
  let authSessionData:
    { id: string; userId: string; expiresAt: Date } | undefined;
  const toDelegate = (legacy: {
    where: (filter: Record<string, unknown>) => {
      first?: () => Promise<unknown>;
      all?: () => Promise<unknown>;
      update?: (data: Record<string, unknown>) => Promise<unknown>;
      updateAll?: (data: Record<string, unknown>) => Promise<unknown>;
    };
    create?: (data: Record<string, unknown>) => Promise<unknown>;
  }) => ({
    findFirst: ({ where }: { where: Record<string, unknown> }) =>
      legacy.where(where).first?.(),
    findMany: ({ where }: { where: Record<string, unknown> }) =>
      legacy.where(where).all?.(),
    create: ({ data }: { data: Record<string, unknown> }) =>
      legacy.create?.(data),
    async updateMany({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) {
      const query = legacy.where(where);
      const result = await (('id' in where || 'tokenHash' in where) &&
      query.update
        ? query.update(data)
        : (query.updateAll?.(data) ?? query.update?.(data)));
      return {
        count: Array.isArray(result) ? result.length : result == null ? 0 : 1,
      };
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    refreshSessionData = undefined;
    authSessionData = undefined;
    const findRole = jest
      .fn()
      .mockReturnValue({ first: jest.fn().mockResolvedValue(role) });
    const createUser = jest.fn().mockResolvedValue({ ...user, clientId });
    createRefreshSession = jest
      .fn()
      .mockImplementation(
        (input: {
          userId: string;
          sessionId: string;
          tokenHash: string;
          expiresAt: Date;
        }) => {
          refreshSessionData = input;
          return Promise.resolve({});
        },
      );
    findUser = jest.fn();
    findRefreshUser = jest.fn();
    updateUser = jest.fn();
    findRoleAssignment = jest.fn();
    includeRoleAssignment = jest.fn(
      (
        _relation: string,
        buildQuery: (query: { where: jest.Mock }) => unknown,
      ) => {
        const whereRole = jest.fn((filter: { name: string }) => filter.name);
        const roleName = buildQuery({ where: whereRole }) as string;
        return {
          where: jest.fn(() => ({
            first: jest.fn(() => findRoleAssignment(roleName)),
          })),
        };
      },
    );
    whereUser = jest.fn((filter: { id?: string }) =>
      filter.id
        ? { first: findRefreshUser, update: updateUser }
        : { first: findUser, update: updateUser },
    );
    const whereUserRole = jest.fn((filter: Record<string, unknown>) => ({
      first: jest.fn(() => findRoleAssignment(filter)),
    }));
    const whereAuditEvent = jest.fn(() => ({ first: jest.fn() }));
    createUserRole = jest.fn().mockResolvedValue({});
    findRefreshSession = jest.fn();
    updateRefreshSession = jest.fn();
    updateAllRefreshSessions = jest.fn().mockResolvedValue([]);
    findAuthSession = jest.fn();
    findAllAuthSessions = jest.fn().mockResolvedValue([]);
    updateAuthSession = jest.fn().mockResolvedValue({ id: 'auth-session-1' });
    updateAllAuthSessions = jest.fn().mockResolvedValue([]);
    whereAuthSession = jest.fn().mockReturnValue({
      first: findAuthSession,
      all: findAllAuthSessions,
      update: updateAuthSession,
      updateAll: updateAllAuthSessions,
    });
    createAuthSession = jest
      .fn()
      .mockImplementation(
        (input: { id: string; userId: string; expiresAt: Date }) => {
          authSessionData = input;
          return Promise.resolve({});
        },
      );
    createAuditEvent = jest.fn().mockResolvedValue({});
    whereRefreshSession = jest.fn().mockReturnValue({
      first: findRefreshSession,
      update: updateRefreshSession,
      updateAll: updateAllRefreshSessions,
    });
    transaction = {
      orm: {
        public: {
          Role: { where: findRole },
          User: { create: createUser, where: whereUser },
          UserRole: { create: createUserRole, where: whereUserRole },
          AuthSession: {
            create: createAuthSession,
            where: whereAuthSession,
          },
          AdminAuditEvent: { create: createAuditEvent },
          RefreshSession: {
            create: createRefreshSession,
            where: whereRefreshSession,
          },
        },
      },
    };
    const prismaTransaction = {
      role: toDelegate({ where: findRole }),
      user: toDelegate({ where: whereUser, create: createUser }),
      userRole: toDelegate({
        where: whereUserRole,
        create: createUserRole,
      }),
      authSession: toDelegate({
        where: whereAuthSession,
        create: createAuthSession,
      }),
      adminAuditEvent: toDelegate({
        where: whereAuditEvent,
        create: createAuditEvent,
      }),
      refreshSession: toDelegate({
        where: whereRefreshSession,
        create: createRefreshSession,
      }),
    };
    transact = jest.fn(
      (callback: (tx: typeof prismaTransaction) => Promise<unknown>) =>
        callback(prismaTransaction),
    );
    hashPassword = jest.fn().mockResolvedValue('argon2-hash');
    verifyPassword = jest.fn().mockResolvedValue(true);
    issueAccessToken = jest.fn().mockResolvedValue('signed-access');
    sendVerificationEmail = jest.fn().mockResolvedValue(undefined);
    verifyEmailToken = jest.fn();

    service = new AuthService(
      {
        $transaction: transact,
        user: toDelegate({ where: whereUser }),
        userRole: {
          ...toDelegate({ where: whereUserRole }),
          findFirst: ({ where }: { where: Record<string, unknown> }) => {
            const relation = where.role as
              { is?: { name?: string } } | undefined;
            const included = includeRoleAssignment(
              'role',
              (query: { where: jest.Mock }) =>
                query.where({ name: relation?.is?.name }),
            );
            return included.where({ userId: where.userId }).first();
          },
        },
        authSession: toDelegate({ where: whereAuthSession }),
        refreshSession: toDelegate({ where: whereRefreshSession }),
        adminAuditEvent: toDelegate({ where: whereAuditEvent }),
      } as unknown as PrismaService,
      {
        hash: hashPassword,
        verify: verifyPassword,
      },
      { issue: issueAccessToken } as unknown as AccessTokenService,
      {
        sendVerificationEmail,
        verifyToken: verifyEmailToken,
      } as unknown as EmailVerificationService,
      {
        request: jest.fn(),
        reset: jest.fn(),
      } as unknown as PasswordResetService,
      new ConfigService({ REFRESH_SESSION_TTL_SECONDS: 2592000 }),
    );
  });

  it('creates an unverified default-role user and sends a verification email', async () => {
    const result = await service.register(
      ' Person@Example.com ',
      'long password',
      clientId,
    );

    expect(hashPassword).toHaveBeenCalledWith('long password');
    expect(transaction.orm.public.Role.where).toHaveBeenCalledWith({
      name: 'user',
    });
    expect(transaction.orm.public.User.create).toHaveBeenCalledWith({
      clientId,
      email: 'person@example.com',
      passwordHash: 'argon2-hash',
    });
    expect(transaction.orm.public.UserRole.create).toHaveBeenCalledWith({
      userId: user.id,
      roleId: role.id,
    });
    expect(sendVerificationEmail).toHaveBeenCalledWith({
      userId: user.id,
      clientId,
      email: user.email,
    });
    expect(refreshSessionData).toBeUndefined();
    expect(createRefreshSession).not.toHaveBeenCalled();
    expect(createAuthSession).not.toHaveBeenCalled();
    expect(issueAccessToken).not.toHaveBeenCalled();
    expect(result).toEqual(user);
  });

  it('returns a generic conflict for duplicate registration', async () => {
    transact.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      }),
    );

    await expect(
      service.register('person@example.com', 'long password', clientId),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.register('person@example.com', 'long password', clientId),
    ).rejects.toThrow('Registration could not be completed.');
    expect(issueAccessToken).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('does not hide unexpected database errors', async () => {
    transact.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.register('person@example.com', 'long password', clientId),
    ).rejects.toThrow('database unavailable');
  });

  it('authenticates an active user and stores only a refresh-token hash', async () => {
    findUser.mockResolvedValue({
      ...user,
      passwordHash: 'argon2-hash',
      status: 'ACTIVE',
      clientId,
      emailVerifiedAt: new Date(),
    });
    const before = Date.now();

    const result = await service.login(
      ' Person@Example.com ',
      'password',
      clientId,
    );

    expect(whereUser).toHaveBeenCalledWith({
      clientId,
      email: 'person@example.com',
    });
    expect(hashPassword).not.toHaveBeenCalled();
    expect(createRefreshSession).toHaveBeenCalledTimes(1);
    expect(createAuthSession).toHaveBeenCalledTimes(1);
    expect(authSessionData?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(refreshSessionData).toBeDefined();
    expect(refreshSessionData?.userId).toBe(user.id);
    expect(refreshSessionData?.sessionId).toBe(authSessionData?.id);
    expect(refreshSessionData?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(refreshSessionData?.tokenHash).not.toBe(result.refreshToken);
    expect(refreshSessionData!.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 2592000000,
    );
    expect(issueAccessToken).toHaveBeenCalledWith(
      user.id,
      clientId,
      authSessionData?.id,
    );
    expect(result.user).toEqual(user);
    expect(result.accessToken).toBe('signed-access');
    expect(typeof result.refreshToken).toBe('string');
  });

  it('rejects unknown users without revealing whether the account exists', async () => {
    findUser.mockResolvedValue(null);

    await expect(
      service.login('missing@example.com', 'password', clientId),
    ).rejects.toThrow('Invalid email or password.');
    expect(createRefreshSession).not.toHaveBeenCalled();
    expect(createAuthSession).not.toHaveBeenCalled();
    expect(issueAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password with a generic error', async () => {
    findUser.mockResolvedValue({
      ...user,
      passwordHash: 'argon2-hash',
      status: 'ACTIVE',
      clientId,
      emailVerifiedAt: new Date(),
    });
    verifyPassword.mockResolvedValue(false);

    await expect(
      service.login(user.email, 'wrong password', clientId),
    ).rejects.toThrow('Invalid email or password.');
    expect(createRefreshSession).not.toHaveBeenCalled();
    expect(createAuthSession).not.toHaveBeenCalled();
    expect(issueAccessToken).not.toHaveBeenCalled();
  });

  it('rejects disabled users with a generic error', async () => {
    findUser.mockResolvedValue({
      ...user,
      passwordHash: 'argon2-hash',
      status: 'DISABLED',
      clientId,
      emailVerifiedAt: new Date(),
    });
    verifyPassword.mockResolvedValue(true);

    await expect(
      service.login(user.email, 'correct password', clientId),
    ).rejects.toThrow('Invalid email or password.');
    expect(createRefreshSession).not.toHaveBeenCalled();
    expect(createAuthSession).not.toHaveBeenCalled();
    expect(issueAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an unverified user before creating a session', async () => {
    findUser.mockResolvedValue({
      ...user,
      passwordHash: 'argon2-hash',
      status: 'ACTIVE',
      clientId,
      emailVerifiedAt: null,
    });

    await expect(
      service.login(user.email, 'correct password', clientId),
    ).rejects.toThrow('Invalid email or password.');
    expect(createRefreshSession).not.toHaveBeenCalled();
    expect(createAuthSession).not.toHaveBeenCalled();
    expect(issueAccessToken).not.toHaveBeenCalled();
  });

  describe('getCurrentUser', () => {
    it('returns only public information for an active user in the client', async () => {
      findRefreshUser.mockResolvedValue({
        ...user,
        status: 'ACTIVE',
        clientId,
        passwordHash: 'must-not-be-returned',
        emailVerifiedAt: new Date(),
      });

      await expect(service.getCurrentUser(user.id, clientId)).resolves.toEqual(
        user,
      );
      expect(whereUser).toHaveBeenCalledWith({ id: user.id, clientId });
    });

    it.each([
      ['a missing user', null],
      ['a disabled user', { ...user, status: 'DISABLED', clientId }],
      [
        'an unverified user',
        { ...user, status: 'ACTIVE', clientId, emailVerifiedAt: null },
      ],
    ])('rejects %s', async (_case, foundUser) => {
      findRefreshUser.mockResolvedValue(foundUser);

      await expect(service.getCurrentUser(user.id, clientId)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getClientUserForAdmin', () => {
    it('returns account status and assigned roles for a user in the client', async () => {
      findRefreshUser.mockResolvedValue({
        ...user,
        clientId,
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2025-12-01T00:00:00.000Z'),
        passwordHash: 'must-not-be-returned',
      });
      findRoleAssignment.mockImplementation((name: string) =>
        Promise.resolve(
          name === 'platform_admin' ? { id: 'assignment' } : null,
        ),
      );

      await expect(
        service.getClientUserForAdmin(user.id, clientId),
      ).resolves.toEqual({
        id: user.id,
        email: user.email,
        status: 'ACTIVE',
        emailVerifiedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2025-12-01T00:00:00.000Z',
        roles: ['platform_admin'],
      });
      expect(whereUser).toHaveBeenCalledWith({ id: user.id, clientId });
      expect(includeRoleAssignment).toHaveBeenCalledTimes(2);
    });

    it('does not reveal a user outside the requested client', async () => {
      findRefreshUser.mockResolvedValue(null);

      await expect(
        service.getClientUserForAdmin(user.id, clientId),
      ).rejects.toThrow('User not found.');
      expect(includeRoleAssignment).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    const claims = {
      userId: user.id,
      clientId,
      email: user.email,
    };

    beforeEach(() => {
      verifyEmailToken.mockResolvedValue(claims);
      updateUser.mockResolvedValue({
        ...user,
        emailVerifiedAt: new Date(),
      });
    });

    it('marks the matching active unverified user as verified', async () => {
      await expect(
        service.verifyEmail('signed-verification-token', clientId),
      ).resolves.toBeUndefined();

      expect(verifyEmailToken).toHaveBeenCalledWith(
        'signed-verification-token',
      );
      expect(whereUser).toHaveBeenCalledWith({
        id: user.id,
        clientId,
        email: user.email,
        status: 'ACTIVE',
        emailVerifiedAt: null,
      });
      expect(updateUser).toHaveBeenCalledWith({
        emailVerifiedAt: expect.any(Date),
      });
    });

    it('rejects a verification token used with a different client', async () => {
      await expect(
        service.verifyEmail('signed-verification-token', 'another-client'),
      ).rejects.toThrow('Invalid or expired verification token.');
      expect(updateUser).not.toHaveBeenCalled();
    });

    it('rejects already-used verification tokens', async () => {
      updateUser.mockResolvedValue(null);

      await expect(
        service.verifyEmail('signed-verification-token', clientId),
      ).rejects.toThrow('Invalid or expired verification token.');
    });
  });

  describe('resendVerificationEmail', () => {
    it('sends only for an active unverified account', async () => {
      findUser.mockResolvedValue({
        ...user,
        clientId,
        status: 'ACTIVE',
        emailVerifiedAt: null,
      });

      await service.resendVerificationEmail(' Person@Example.com ', clientId);

      expect(whereUser).toHaveBeenCalledWith({
        clientId,
        email: 'person@example.com',
      });
      expect(sendVerificationEmail).toHaveBeenCalledWith({
        userId: user.id,
        clientId,
        email: user.email,
      });
    });

    it('does not send for unknown or verified users', async () => {
      findUser.mockResolvedValue(null);
      await expect(
        service.resendVerificationEmail(user.email, clientId),
      ).resolves.toBeUndefined();

      findUser.mockResolvedValue({
        ...user,
        clientId,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      });
      await expect(
        service.resendVerificationEmail(user.email, clientId),
      ).resolves.toBeUndefined();

      expect(sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    const existingToken = 'r'.repeat(43);
    const refreshSession = {
      id: 'session-1',
      sessionId: 'auth-session-1',
      userId: user.id,
      tokenHash: 'stored-token-hash',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null as string | null,
    };

    beforeEach(() => {
      findRefreshSession.mockResolvedValue(refreshSession);
      findAuthSession.mockResolvedValue({ id: refreshSession.sessionId });
      updateAuthSession.mockResolvedValue({ id: refreshSession.sessionId });
      findRefreshUser.mockResolvedValue({
        ...user,
        status: 'ACTIVE',
        clientId,
        emailVerifiedAt: new Date(),
      });
    });

    it('revokes the matching active refresh session', async () => {
      await expect(
        service.logout(existingToken, clientId),
      ).resolves.toBeUndefined();

      expect(whereRefreshSession).toHaveBeenNthCalledWith(1, {
        tokenHash: createHashForTest(existingToken),
      });
      expect(whereAuthSession).toHaveBeenCalledWith({
        id: refreshSession.sessionId,
        userId: refreshSession.userId,
        revokedAt: null,
      });
      expect(whereRefreshSession).toHaveBeenNthCalledWith(2, {
        sessionId: refreshSession.sessionId,
        revokedAt: null,
      });
      expect(updateAuthSession).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
      expect(updateAllRefreshSessions).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
    });

    it('does nothing for missing, malformed, or unknown refresh tokens', async () => {
      await service.logout(undefined, clientId);
      await service.logout('malformed', clientId);
      findRefreshSession.mockResolvedValue(null);
      await service.logout(existingToken, clientId);

      expect(whereRefreshSession).toHaveBeenCalledTimes(1);
      expect(updateAuthSession).not.toHaveBeenCalled();
      expect(updateAllRefreshSessions).not.toHaveBeenCalled();
    });

    it('does not revoke a session belonging to a different client', async () => {
      findRefreshUser.mockResolvedValue({
        ...user,
        status: 'ACTIVE',
        clientId: 'another-client',
      });

      await service.logout(existingToken, clientId);

      expect(updateAuthSession).not.toHaveBeenCalled();
      expect(updateAllRefreshSessions).not.toHaveBeenCalled();
    });

    it('revokes the session family when logout presents an older rotated token', async () => {
      findRefreshSession.mockResolvedValue({
        ...refreshSession,
        revokedAt: new Date(),
      });

      await service.logout(existingToken, clientId);

      expect(updateAuthSession).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
      expect(updateAllRefreshSessions).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
    });
  });

  describe('refresh', () => {
    const existingToken = 'r'.repeat(43);
    const refreshSession = {
      id: 'session-1',
      sessionId: 'auth-session-1',
      userId: user.id,
      tokenHash: 'stored-token-hash',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null as string | null,
    };

    beforeEach(() => {
      findRefreshSession.mockResolvedValue(refreshSession);
      findAuthSession.mockResolvedValue({
        id: refreshSession.sessionId,
        expiresAt: new Date(Date.now() + 60_000),
      });
      updateRefreshSession.mockImplementation((data: { revokedAt: string }) =>
        Promise.resolve({ ...refreshSession, ...data }),
      );
      updateAuthSession.mockResolvedValue({ id: refreshSession.sessionId });
      findRefreshUser.mockResolvedValue({
        ...user,
        status: 'ACTIVE',
        clientId,
        emailVerifiedAt: new Date(),
      });
    });

    it('rotates a valid session and issues a new access token', async () => {
      const result = await service.refresh(existingToken, clientId);

      expect(whereRefreshSession).toHaveBeenNthCalledWith(1, {
        tokenHash: createHashForTest(existingToken),
      });
      expect(whereRefreshSession).toHaveBeenNthCalledWith(2, {
        id: refreshSession.id,
        revokedAt: null,
      });
      expect(updateRefreshSession).toHaveBeenCalledTimes(1);
      expect(refreshSessionData?.userId).toBe(user.id);
      expect(refreshSessionData?.sessionId).toBe(refreshSession.sessionId);
      expect(refreshSessionData?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(refreshSessionData?.tokenHash).not.toBe(
        createHashForTest(existingToken),
      );
      expect(refreshSessionData?.expiresAt).toBeDefined();
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken).not.toBe(existingToken);
      expect(result.user).toEqual(user);
      expect(result.accessToken).toBe('signed-access');
      expect(issueAccessToken).toHaveBeenCalledWith(
        user.id,
        clientId,
        refreshSession.sessionId,
      );
    });

    it('rejects malformed or unknown refresh tokens', async () => {
      await expect(service.refresh('malformed', clientId)).rejects.toThrow(
        'Invalid or expired refresh token.',
      );
      findRefreshSession.mockResolvedValue(null);
      await expect(service.refresh(existingToken, clientId)).rejects.toThrow(
        'Invalid or expired refresh token.',
      );
      expect(whereRefreshSession).toHaveBeenCalledTimes(1);
      expect(issueAccessToken).not.toHaveBeenCalled();
    });

    it('rejects expired sessions without rotating them', async () => {
      findRefreshSession.mockResolvedValue({
        ...refreshSession,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh(existingToken, clientId)).rejects.toThrow(
        'Invalid or expired refresh token.',
      );
      expect(updateRefreshSession).not.toHaveBeenCalled();
      expect(refreshSessionData).toBeUndefined();
    });

    it('rejects and revokes sessions for unverified users', async () => {
      findRefreshUser.mockResolvedValue({
        ...user,
        status: 'ACTIVE',
        clientId,
        emailVerifiedAt: null,
      });

      await expect(service.refresh(existingToken, clientId)).rejects.toThrow(
        'Invalid or expired refresh token.',
      );
      expect(updateAllRefreshSessions).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
      expect(refreshSessionData).toBeUndefined();
    });

    it('revokes all active sessions when a revoked token is reused', async () => {
      findRefreshSession.mockResolvedValue({
        ...refreshSession,
        revokedAt: new Date(),
      });

      await expect(service.refresh(existingToken, clientId)).rejects.toThrow(
        'Invalid or expired refresh token.',
      );
      expect(updateAllRefreshSessions).toHaveBeenCalledTimes(1);
      expect(whereRefreshSession).toHaveBeenLastCalledWith({
        userId: user.id,
        revokedAt: null,
      });
      expect(updateAllAuthSessions).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
      expect(refreshSessionData).toBeUndefined();
    });

    it('rejects a session presented for a different client', async () => {
      findRefreshUser.mockResolvedValue({
        ...user,
        status: 'ACTIVE',
        clientId: 'another-client',
      });

      await expect(service.refresh(existingToken, clientId)).rejects.toThrow(
        'Invalid or expired refresh token.',
      );
      expect(updateRefreshSession).not.toHaveBeenCalled();
      expect(refreshSessionData).toBeUndefined();
    });

    it('rejects disabled users and revokes their session', async () => {
      findRefreshUser.mockResolvedValue({
        ...user,
        status: 'DISABLED',
        clientId,
      });

      await expect(service.refresh(existingToken, clientId)).rejects.toThrow(
        'Invalid or expired refresh token.',
      );
      expect(updateAllRefreshSessions).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
      expect(updateAuthSession).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
      expect(refreshSessionData).toBeUndefined();
    });

    it('treats an already-consumed session as reuse', async () => {
      updateRefreshSession.mockResolvedValue(null);

      await expect(service.refresh(existingToken, clientId)).rejects.toThrow(
        'Invalid or expired refresh token.',
      );
      expect(updateAllRefreshSessions).toHaveBeenCalledTimes(1);
      expect(updateAllAuthSessions).toHaveBeenCalledTimes(1);
      expect(refreshSessionData).toBeUndefined();
    });
  });

  describe('admin account and session operations', () => {
    const actorUserId = 'admin-user';
    const targetUserId = 'target-user';
    const sessionId = '00000000-0000-4000-8000-000000000003';

    beforeEach(() => {
      findRefreshUser.mockResolvedValue({
        ...user,
        id: targetUserId,
        clientId,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      });
    });

    it('lists only unexpired active session metadata for a same-client user', async () => {
      findAllAuthSessions.mockResolvedValue([
        {
          id: sessionId,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          expiresAt: new Date(Date.now() + 60_000),
        },
        {
          id: 'expired-session',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date(Date.now() - 60_000),
        },
      ]);

      await expect(
        service.getClientUserSessions(targetUserId, clientId),
      ).resolves.toEqual([
        {
          id: sessionId,
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: expect.any(String),
        },
      ]);
      expect(whereUser).toHaveBeenCalledWith({
        id: targetUserId,
        clientId,
      });
      expect(whereAuthSession).toHaveBeenCalledWith({
        userId: targetUserId,
        revokedAt: null,
      });
    });

    it('disables a same-client account, revokes its sessions and records an audit event', async () => {
      await expect(
        service.disableClientUser(actorUserId, targetUserId, clientId),
      ).resolves.toBeUndefined();

      expect(updateUser).toHaveBeenCalledWith({ status: 'DISABLED' });
      expect(updateAllAuthSessions).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
      expect(updateAllRefreshSessions).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
      expect(createAuditEvent).toHaveBeenCalledWith({
        clientId,
        actorUserId,
        targetUserId,
        action: 'USER_DISABLED',
      });
    });

    it('prevents administrators from disabling their own account', async () => {
      await expect(
        service.disableClientUser(actorUserId, actorUserId, clientId),
      ).rejects.toThrow(ForbiddenException);

      expect(transact).not.toHaveBeenCalled();
      expect(createAuditEvent).not.toHaveBeenCalled();
    });

    it('re-enables an account without restoring its revoked sessions', async () => {
      await expect(
        service.enableClientUser(actorUserId, targetUserId, clientId),
      ).resolves.toBeUndefined();

      expect(updateUser).toHaveBeenCalledWith({ status: 'ACTIVE' });
      expect(updateAllAuthSessions).not.toHaveBeenCalled();
      expect(updateAllRefreshSessions).not.toHaveBeenCalled();
      expect(createAuditEvent).toHaveBeenCalledWith({
        clientId,
        actorUserId,
        targetUserId,
        action: 'USER_ENABLED',
      });
    });

    it('revokes a specific same-client session and writes an audit event', async () => {
      findAuthSession.mockResolvedValue({
        id: sessionId,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.revokeClientUserSession(
          actorUserId,
          targetUserId,
          clientId,
          sessionId,
        ),
      ).resolves.toBeUndefined();

      expect(whereAuthSession).toHaveBeenCalledWith({
        id: sessionId,
        userId: targetUserId,
        revokedAt: null,
      });
      expect(updateAuthSession).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
      expect(whereRefreshSession).toHaveBeenCalledWith({
        sessionId,
        revokedAt: null,
      });
      expect(updateAllRefreshSessions).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
      expect(createAuditEvent).toHaveBeenCalledWith({
        clientId,
        actorUserId,
        targetUserId,
        action: 'SESSION_REVOKED',
        sessionId,
      });
    });

    it('does not audit or revoke a missing or expired session', async () => {
      findAuthSession.mockResolvedValue(null);

      await expect(
        service.revokeClientUserSession(
          actorUserId,
          targetUserId,
          clientId,
          sessionId,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(updateAuthSession).not.toHaveBeenCalled();
      expect(createAuditEvent).not.toHaveBeenCalled();

      findAuthSession.mockResolvedValue({
        id: sessionId,
        expiresAt: new Date(Date.now() - 60_000),
      });
      await expect(
        service.revokeClientUserSession(
          actorUserId,
          targetUserId,
          clientId,
          sessionId,
        ),
      ).rejects.toThrow('Active session not found.');
    });

    it('does not expose an account from a different client', async () => {
      findRefreshUser.mockResolvedValue(null);

      await expect(
        service.disableClientUser(actorUserId, targetUserId, clientId),
      ).rejects.toThrow(NotFoundException);

      expect(updateUser).not.toHaveBeenCalled();
      expect(createAuditEvent).not.toHaveBeenCalled();
    });
  });
});

function createHashForTest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
