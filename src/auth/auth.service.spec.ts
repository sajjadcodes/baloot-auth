import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma.service.js';
import { AccessTokenService } from './access-token.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const user = { id: 'user-1', email: 'person@example.com' };
  const role = { id: 'role-user' };
  const clientId = '00000000-0000-4000-8000-000000000001';

  let service: AuthService;
  let findUser: jest.Mock;
  let whereUser: jest.Mock;
  let createSession: jest.Mock;
  let transaction: {
    orm: {
      public: {
        Role: { where: jest.Mock };
        User: { create: jest.Mock };
        UserRole: { create: jest.Mock };
        RefreshSession: { create: jest.Mock };
      };
    };
  };
  let transact: jest.Mock;
  let hashPassword: jest.Mock;
  let verifyPassword: jest.Mock;
  let issueAccessToken: jest.Mock;
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
    const createUser = jest.fn().mockResolvedValue(user);
    const createRefreshSession = jest
      .fn()
      .mockImplementation(
        (input: { userId: string; tokenHash: string; expiresAt: string }) => {
          refreshSessionData = input;
          return Promise.resolve({});
        },
      );
    findUser = jest.fn();
    whereUser = jest.fn().mockReturnValue({ first: findUser });
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
          User: { create: createUser },
          UserRole: { create: jest.fn().mockResolvedValue({}) },
          RefreshSession: { create: createRefreshSession },
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

    service = new AuthService(
      {
        client: { transaction: transact },
        public: {
          User: {
            where: whereUser,
          },
          RefreshSession: { create: createSession },
        },
      } as unknown as PrismaService,
      {
        hash: hashPassword,
        verify: verifyPassword,
      },
      { issue: issueAccessToken } as unknown as AccessTokenService,
      new ConfigService({ REFRESH_SESSION_TTL_SECONDS: 2592000 }),
    );
  });

  it('creates a default-role user and stores only a refresh-token hash', async () => {
    const before = Date.now();
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
    expect(refreshSessionData).toBeDefined();
    expect(refreshSessionData?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(refreshSessionData?.tokenHash).not.toBe(result.refreshToken);
    expect(refreshSessionData?.userId).toBe(user.id);
    expect(Date.parse(refreshSessionData!.expiresAt)).toBeGreaterThanOrEqual(
      before + 2592000000,
    );
    expect(Date.parse(refreshSessionData!.expiresAt)).toBeLessThanOrEqual(
      Date.now() + 2592000000,
    );
    expect(typeof result.refreshToken).toBe('string');
    expect(result).toEqual({
      user,
      accessToken: 'signed-access',
      refreshToken: result.refreshToken,
    });
    expect(issueAccessToken).toHaveBeenCalledWith(user.id, clientId);
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
    });
    verifyPassword.mockResolvedValue(true);

    await expect(
      service.login(user.email, 'correct password', clientId),
    ).rejects.toThrow('Invalid email or password.');
    expect(createSession).not.toHaveBeenCalled();
    expect(issueAccessToken).not.toHaveBeenCalled();
  });
});
