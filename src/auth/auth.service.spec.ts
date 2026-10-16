import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma.service.js';
import { AccessTokenService } from './access-token.service.js';
import { AuthService } from './auth.service.js';
import { EmailVerificationService } from './email-verification.service.js';

describe('AuthService', () => {
  const user = { id: 'user-1', email: 'person@example.com' };
  const role = { id: 'role-user' };
  const clientId = '00000000-0000-4000-8000-000000000001';

  let service: AuthService;
  let findUser: jest.Mock;
  let findRefreshUser: jest.Mock;
  let updateUser: jest.Mock;
  let whereUser: jest.Mock;
  let findRefreshSession: jest.Mock;
  let whereRefreshSession: jest.Mock;
  let updateRefreshSession: jest.Mock;
  let updateAllRefreshSessions: jest.Mock;
  let createSession: jest.Mock;
  let transaction: {
    orm: {
      public: {
        Role: { where: jest.Mock };
        User: { create: jest.Mock; where: jest.Mock };
        UserRole: { create: jest.Mock };
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
    { userId: string; tokenHash: string; expiresAt: string } | undefined;
  let loginSessionData:
    { userId: string; tokenHash: string; expiresAt: string } | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    refreshSessionData = undefined;
    loginSessionData = undefined;
    const findRole = jest
      .fn()
      .mockReturnValue({ first: jest.fn().mockResolvedValue(role) });
    const createUser = jest.fn().mockResolvedValue({ ...user, clientId });
    const createRefreshSession = jest
      .fn()
      .mockImplementation(
        (input: { userId: string; tokenHash: string; expiresAt: string }) => {
          refreshSessionData = input;
          return Promise.resolve({});
        },
      );
    findUser = jest.fn();
    findRefreshUser = jest.fn();
    updateUser = jest.fn();
    whereUser = jest.fn((filter: { id?: string }) =>
      filter.id
        ? { first: findRefreshUser, update: updateUser }
        : { first: findUser, update: updateUser },
    );
    findRefreshSession = jest.fn();
    updateRefreshSession = jest.fn();
    updateAllRefreshSessions = jest.fn().mockResolvedValue([]);
    whereRefreshSession = jest.fn().mockReturnValue({
      first: findRefreshSession,
      update: updateRefreshSession,
      updateAll: updateAllRefreshSessions,
    });
    createSession = jest
      .fn()
      .mockImplementation(
        (input: { userId: string; tokenHash: string; expiresAt: string }) => {
          loginSessionData = input;
          return Promise.resolve({});
        },
      );
    transaction = {
      orm: {
        public: {
          Role: { where: findRole },
          User: { create: createUser, where: whereUser },
          UserRole: { create: jest.fn().mockResolvedValue({}) },
          RefreshSession: {
            create: createRefreshSession,
            where: whereRefreshSession,
          },
        },
      },
    };
    transact = jest.fn(
      (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    hashPassword = jest.fn().mockResolvedValue('argon2-hash');
    verifyPassword = jest.fn().mockResolvedValue(true);
    issueAccessToken = jest.fn().mockResolvedValue('signed-access');
    sendVerificationEmail = jest.fn().mockResolvedValue(undefined);
    verifyEmailToken = jest.fn();

    service = new AuthService(
      {
        client: { transaction: transact },
        public: {
          User: {
            where: whereUser,
          },
          RefreshSession: {
            create: createSession,
            where: whereRefreshSession,
          },
        },
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
    expect(createSession).not.toHaveBeenCalled();
    expect(issueAccessToken).not.toHaveBeenCalled();
    expect(result).toEqual(user);
  });

  it('returns a generic conflict for duplicate registration', async () => {
    transact.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), {
        code: '23505',
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
      emailVerifiedAt: new Date().toISOString(),
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
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(loginSessionData).toBeDefined();
    expect(loginSessionData?.userId).toBe(user.id);
    expect(loginSessionData?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(loginSessionData?.tokenHash).not.toBe(result.refreshToken);
    expect(Date.parse(loginSessionData!.expiresAt)).toBeGreaterThanOrEqual(
      before + 2592000000,
    );
    expect(issueAccessToken).toHaveBeenCalledWith(user.id, clientId);
    expect(result.user).toEqual(user);
    expect(result.accessToken).toBe('signed-access');
    expect(typeof result.refreshToken).toBe('string');
  });

  it('rejects unknown users without revealing whether the account exists', async () => {
    findUser.mockResolvedValue(null);

    await expect(
      service.login('missing@example.com', 'password', clientId),
    ).rejects.toThrow('Invalid email or password.');
    expect(createSession).not.toHaveBeenCalled();
    expect(issueAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password with a generic error', async () => {
    findUser.mockResolvedValue({
      ...user,
      passwordHash: 'argon2-hash',
      status: 'ACTIVE',
      clientId,
      emailVerifiedAt: new Date().toISOString(),
    });
    verifyPassword.mockResolvedValue(false);

    await expect(
      service.login(user.email, 'wrong password', clientId),
    ).rejects.toThrow('Invalid email or password.');
    expect(createSession).not.toHaveBeenCalled();
    expect(issueAccessToken).not.toHaveBeenCalled();
  });

  it('rejects disabled users with a generic error', async () => {
    findUser.mockResolvedValue({
      ...user,
      passwordHash: 'argon2-hash',
      status: 'DISABLED',
      clientId,
      emailVerifiedAt: new Date().toISOString(),
    });
    verifyPassword.mockResolvedValue(true);

    await expect(
      service.login(user.email, 'correct password', clientId),
    ).rejects.toThrow('Invalid email or password.');
    expect(createSession).not.toHaveBeenCalled();
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
    expect(createSession).not.toHaveBeenCalled();
    expect(issueAccessToken).not.toHaveBeenCalled();
  });

  describe('getCurrentUser', () => {
    it('returns only public information for an active user in the client', async () => {
      findRefreshUser.mockResolvedValue({
        ...user,
        status: 'ACTIVE',
        clientId,
        passwordHash: 'must-not-be-returned',
        emailVerifiedAt: new Date().toISOString(),
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
        emailVerifiedAt: new Date().toISOString(),
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
        emailVerifiedAt: expect.any(String),
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
        emailVerifiedAt: new Date().toISOString(),
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
      userId: user.id,
      tokenHash: 'stored-token-hash',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      revokedAt: null as string | null,
    };

    beforeEach(() => {
      findRefreshSession.mockResolvedValue(refreshSession);
      updateRefreshSession.mockResolvedValue(refreshSession);
      findRefreshUser.mockResolvedValue({
        ...user,
        status: 'ACTIVE',
        clientId,
        emailVerifiedAt: new Date().toISOString(),
      });
    });

    it('revokes the matching active refresh session', async () => {
      await expect(
        service.logout(existingToken, clientId),
      ).resolves.toBeUndefined();

      expect(whereRefreshSession).toHaveBeenNthCalledWith(1, {
        tokenHash: createHashForTest(existingToken),
      });
      expect(whereRefreshSession).toHaveBeenNthCalledWith(2, {
        id: refreshSession.id,
        revokedAt: null,
      });
      expect(updateRefreshSession).toHaveBeenCalledWith({
        revokedAt: expect.any(String),
      });
    });

    it('does nothing for missing, malformed, or unknown refresh tokens', async () => {
      await service.logout(undefined, clientId);
      await service.logout('malformed', clientId);
      findRefreshSession.mockResolvedValue(null);
      await service.logout(existingToken, clientId);

      expect(whereRefreshSession).toHaveBeenCalledTimes(1);
      expect(updateRefreshSession).not.toHaveBeenCalled();
    });

    it('does not revoke a session belonging to a different client', async () => {
      findRefreshUser.mockResolvedValue({
        ...user,
        status: 'ACTIVE',
        clientId: 'another-client',
      });

      await service.logout(existingToken, clientId);

      expect(updateRefreshSession).not.toHaveBeenCalled();
    });

    it('does not revoke a session that was already revoked', async () => {
      findRefreshSession.mockResolvedValue({
        ...refreshSession,
        revokedAt: new Date().toISOString(),
      });

      await service.logout(existingToken, clientId);

      expect(updateRefreshSession).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    const existingToken = 'r'.repeat(43);
    const refreshSession = {
      id: 'session-1',
      userId: user.id,
      tokenHash: 'stored-token-hash',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      revokedAt: null as string | null,
    };

    beforeEach(() => {
      findRefreshSession.mockResolvedValue(refreshSession);
      updateRefreshSession.mockImplementation((data: { revokedAt: string }) =>
        Promise.resolve({ ...refreshSession, ...data }),
      );
      findRefreshUser.mockResolvedValue({
        ...user,
        status: 'ACTIVE',
        clientId,
        emailVerifiedAt: new Date().toISOString(),
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
      expect(refreshSessionData?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(refreshSessionData?.tokenHash).not.toBe(
        createHashForTest(existingToken),
      );
      expect(refreshSessionData?.expiresAt).toBeDefined();
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken).not.toBe(existingToken);
      expect(result.user).toEqual(user);
      expect(result.accessToken).toBe('signed-access');
      expect(issueAccessToken).toHaveBeenCalledWith(user.id, clientId);
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
        expiresAt: new Date(Date.now() - 1000).toISOString(),
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
      expect(updateRefreshSession).toHaveBeenCalledWith({
        revokedAt: expect.any(String),
      });
      expect(refreshSessionData).toBeUndefined();
    });

    it('revokes all active sessions when a revoked token is reused', async () => {
      findRefreshSession.mockResolvedValue({
        ...refreshSession,
        revokedAt: new Date().toISOString(),
      });

      await expect(service.refresh(existingToken, clientId)).rejects.toThrow(
        'Invalid or expired refresh token.',
      );
      expect(updateAllRefreshSessions).toHaveBeenCalledTimes(1);
      expect(whereRefreshSession).toHaveBeenLastCalledWith({
        userId: user.id,
        revokedAt: null,
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
      expect(updateRefreshSession).toHaveBeenCalledTimes(1);
      expect(refreshSessionData).toBeUndefined();
    });

    it('treats an already-consumed session as reuse', async () => {
      updateRefreshSession.mockResolvedValue(null);

      await expect(service.refresh(existingToken, clientId)).rejects.toThrow(
        'Invalid or expired refresh token.',
      );
      expect(updateAllRefreshSessions).toHaveBeenCalledTimes(1);
      expect(refreshSessionData).toBeUndefined();
    });
  });
});

function createHashForTest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
