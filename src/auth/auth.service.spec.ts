import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma.service';
import { AccessTokenService } from './access-token.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const user = { id: 'user-1', email: 'person@example.com' };
  const role = { id: 'role-user' };

  let service: AuthService;
  let findUser: jest.Mock;
  let createSession: jest.Mock;
  let transaction: {
    role: { upsert: jest.Mock };
    user: { create: jest.Mock };
    refreshSession: { create: jest.Mock };
  };
  let transact: jest.Mock;
  let hashPassword: jest.Mock;
  let verifyPassword: jest.Mock;
  let issueAccessToken: jest.Mock;
  let refreshSessionData:
    { userId: string; tokenHash: string; expiresAt: Date } | undefined;
  let loginSessionData:
    { userId: string; tokenHash: string; expiresAt: Date } | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    refreshSessionData = undefined;
    loginSessionData = undefined;
    const upsertRole = jest.fn().mockResolvedValue(role);
    const createUser = jest.fn().mockResolvedValue(user);
    const createRefreshSession = jest
      .fn()
      .mockImplementation(
        (input: {
          data: { userId: string; tokenHash: string; expiresAt: Date };
        }) => {
          refreshSessionData = input.data;
          return Promise.resolve({});
        },
      );
    findUser = jest.fn();
    createSession = jest
      .fn()
      .mockImplementation(
        (input: {
          data: { userId: string; tokenHash: string; expiresAt: Date };
        }) => {
          loginSessionData = input.data;
          return Promise.resolve({});
        },
      );
    transaction = {
      role: { upsert: upsertRole },
      user: { create: createUser },
      refreshSession: { create: createRefreshSession },
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
        $transaction: transact,
        user: { findUnique: findUser },
        refreshSession: { create: createSession },
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
    );

    expect(hashPassword).toHaveBeenCalledWith('long password');
    expect(transaction.role.upsert).toHaveBeenCalledWith({
      where: { name: 'user' },
      update: {},
      create: { name: 'user' },
      select: { id: true },
    });
    expect(transaction.user.create).toHaveBeenCalledWith({
      data: {
        email: 'person@example.com',
        passwordHash: 'argon2-hash',
        roles: { create: { role: { connect: { id: role.id } } } },
      },
      select: { id: true, email: true },
    });
    expect(refreshSessionData).toBeDefined();
    expect(refreshSessionData?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(refreshSessionData?.tokenHash).not.toBe(result.refreshToken);
    expect(refreshSessionData?.userId).toBe(user.id);
    expect(refreshSessionData?.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 2592000000,
    );
    expect(refreshSessionData?.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 2592000000,
    );
    expect(typeof result.refreshToken).toBe('string');
    expect(result).toEqual({
      user,
      accessToken: 'signed-access',
      refreshToken: result.refreshToken,
    });
    expect(issueAccessToken).toHaveBeenCalledWith(user.id);
  });

  it('returns a generic conflict for duplicate registration', async () => {
    transact.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        clientVersion: '7.10.0',
      }),
    );

    await expect(
      service.register('person@example.com', 'long password'),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.register('person@example.com', 'long password'),
    ).rejects.toThrow('Registration could not be completed.');
    expect(issueAccessToken).not.toHaveBeenCalled();
  });

  it('does not hide unexpected database errors', async () => {
    transact.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.register('person@example.com', 'long password'),
    ).rejects.toThrow('database unavailable');
  });

  it('authenticates an active user and stores only a refresh-token hash', async () => {
    findUser.mockResolvedValue({
      ...user,
      passwordHash: 'argon2-hash',
      status: 'ACTIVE',
    });
    const before = Date.now();

    const result = await service.login(' Person@Example.com ', 'password');

    expect(findUser).toHaveBeenCalledWith({
      where: { email: 'person@example.com' },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
      },
    });
    expect(hashPassword).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(loginSessionData).toBeDefined();
    expect(loginSessionData?.userId).toBe(user.id);
    expect(loginSessionData?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(loginSessionData?.tokenHash).not.toBe(result.refreshToken);
    expect(loginSessionData?.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 2592000000,
    );
    expect(issueAccessToken).toHaveBeenCalledWith(user.id);
    expect(result.user).toEqual(user);
    expect(result.accessToken).toBe('signed-access');
    expect(typeof result.refreshToken).toBe('string');
  });

  it('rejects unknown users without revealing whether the account exists', async () => {
    findUser.mockResolvedValue(null);

    await expect(
      service.login('missing@example.com', 'password'),
    ).rejects.toThrow('Invalid email or password.');
    expect(createSession).not.toHaveBeenCalled();
    expect(issueAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password with a generic error', async () => {
    findUser.mockResolvedValue({
      ...user,
      passwordHash: 'argon2-hash',
      status: 'ACTIVE',
    });
    verifyPassword.mockResolvedValue(false);

    await expect(service.login(user.email, 'wrong password')).rejects.toThrow(
      'Invalid email or password.',
    );
    expect(createSession).not.toHaveBeenCalled();
    expect(issueAccessToken).not.toHaveBeenCalled();
  });

  it('rejects disabled users with a generic error', async () => {
    findUser.mockResolvedValue({
      ...user,
      passwordHash: 'argon2-hash',
      status: 'DISABLED',
    });
    verifyPassword.mockResolvedValue(true);

    await expect(service.login(user.email, 'correct password')).rejects.toThrow(
      'Invalid email or password.',
    );
    expect(createSession).not.toHaveBeenCalled();
    expect(issueAccessToken).not.toHaveBeenCalled();
  });
});
