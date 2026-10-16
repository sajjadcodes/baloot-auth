import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../database/prisma.service.js';
import { EmailDeliveryService } from './email-delivery.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { PasswordService } from './password.service.js';

describe('PasswordResetService', () => {
  const clientId = '00000000-0000-4000-8000-000000000001';
  const user = {
    id: 'user-1',
    clientId,
    email: 'person@example.com',
    passwordHash: 'argon2-old-hash',
    status: 'ACTIVE',
    emailVerifiedAt: new Date().toISOString(),
  };
  const resetSecret = 'test-only-password-reset-secret-32-characters';

  let service: PasswordResetService;
  let findUser: jest.Mock;
  let whereUser: jest.Mock;
  let updateUser: jest.Mock;
  let updateSessions: jest.Mock;
  let verifyToken: jest.Mock;
  let signToken: jest.Mock;
  let hashPassword: jest.Mock;
  let sendEmail: jest.Mock;
  let transact: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    findUser = jest.fn();
    updateUser = jest.fn();
    updateSessions = jest.fn().mockResolvedValue([]);
    whereUser = jest.fn(() => ({ first: findUser, update: updateUser }));
    verifyToken = jest.fn();
    signToken = jest.fn().mockResolvedValue('signed-reset-token');
    hashPassword = jest.fn().mockResolvedValue('argon2-new-hash');
    sendEmail = jest.fn().mockResolvedValue(undefined);

    const transaction = {
      orm: {
        public: {
          User: { where: whereUser },
          RefreshSession: {
            where: jest.fn(() => ({ updateAll: updateSessions })),
          },
        },
      },
    };
    transact = jest.fn((callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction),
    );

    service = new PasswordResetService(
      new ConfigService({
        PASSWORD_RESET_SECRET: resetSecret,
        PASSWORD_RESET_TTL_SECONDS: 900,
        PASSWORD_RESET_URL: 'http://localhost:5173/reset-password',
      }),
      {
        signAsync: signToken,
        verifyAsync: verifyToken,
      } as unknown as JwtService,
      {
        client: { transaction: transact },
        public: { User: { where: whereUser } },
      } as unknown as PrismaService,
      { hash: hashPassword } as unknown as PasswordService,
      { send: sendEmail } as unknown as EmailDeliveryService,
    );
  });

  it('sends a short-lived reset link only for active verified accounts', async () => {
    findUser.mockResolvedValue(user);

    await service.request(' Person@Example.com ', clientId);

    expect(whereUser).toHaveBeenCalledWith({
      clientId,
      email: 'person@example.com',
    });
    expect(signToken).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId,
        email: user.email,
        passwordFingerprint: createHmac('sha256', resetSecret)
          .update(user.passwordHash)
          .digest('hex'),
        purpose: 'reset-password',
      }),
      expect.objectContaining({
        expiresIn: 900,
        issuer: 'baloot-auth',
        audience: 'password-reset',
        subject: user.id,
        secret: resetSecret,
      }),
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        subject: 'Reset your password',
        text: expect.stringContaining(
          'http://localhost:5173/reset-password#token=signed-reset-token',
        ),
      }),
    );
  });

  it('does not send reset mail for unknown, disabled, or unverified users', async () => {
    findUser.mockResolvedValue(null);
    await expect(
      service.request(user.email, clientId),
    ).resolves.toBeUndefined();

    findUser.mockResolvedValue({ ...user, status: 'DISABLED' });
    await expect(
      service.request(user.email, clientId),
    ).resolves.toBeUndefined();

    findUser.mockResolvedValue({ ...user, emailVerifiedAt: null });
    await expect(
      service.request(user.email, clientId),
    ).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('updates the password once and revokes all active refresh sessions', async () => {
    const fingerprint = createHmac('sha256', resetSecret)
      .update(user.passwordHash)
      .digest('hex');
    findUser.mockResolvedValue(user);
    verifyToken.mockResolvedValue({
      sub: user.id,
      clientId,
      email: user.email,
      passwordFingerprint: fingerprint,
      purpose: 'reset-password',
    });
    updateUser.mockResolvedValue({ id: user.id });

    await service.reset('valid-token', 'new secure password', clientId);

    expect(whereUser).toHaveBeenNthCalledWith(1, {
      id: user.id,
      clientId,
      email: user.email,
      status: 'ACTIVE',
    });
    expect(whereUser).toHaveBeenNthCalledWith(2, {
      id: user.id,
      clientId,
      email: user.email,
      status: 'ACTIVE',
      passwordHash: user.passwordHash,
    });
    expect(updateUser).toHaveBeenCalledWith({
      passwordHash: 'argon2-new-hash',
    });
    expect(updateSessions).toHaveBeenCalledWith({
      revokedAt: expect.any(String),
    });
    expect(transact).toHaveBeenCalledTimes(1);
    expect(hashPassword).toHaveBeenCalledWith('new secure password');
  });

  it('rejects a reused token after the password hash changes', async () => {
    const fingerprint = createHmac('sha256', resetSecret)
      .update(user.passwordHash)
      .digest('hex');
    findUser.mockResolvedValue({ ...user, passwordHash: 'argon2-new-hash' });
    verifyToken.mockResolvedValue({
      sub: user.id,
      clientId,
      email: user.email,
      passwordFingerprint: fingerprint,
      purpose: 'reset-password',
    });

    await expect(
      service.reset('already-used-token', 'another secure password', clientId),
    ).rejects.toThrow(UnauthorizedException);
    expect(transact).not.toHaveBeenCalled();
  });

  it('rejects a second concurrent reset when the conditional update loses the race', async () => {
    const fingerprint = createHmac('sha256', resetSecret)
      .update(user.passwordHash)
      .digest('hex');
    findUser.mockResolvedValue(user);
    verifyToken.mockResolvedValue({
      sub: user.id,
      clientId,
      email: user.email,
      passwordFingerprint: fingerprint,
      purpose: 'reset-password',
    });
    updateUser.mockResolvedValue(null);

    await expect(
      service.reset('valid-token', 'new secure password', clientId),
    ).rejects.toThrow(UnauthorizedException);
    expect(updateSessions).not.toHaveBeenCalled();
  });

  it('rejects a reset token bound to a different client', async () => {
    verifyToken.mockResolvedValue({
      sub: user.id,
      clientId: '00000000-0000-4000-8000-000000000002',
      email: user.email,
      passwordFingerprint: 'a'.repeat(64),
      purpose: 'reset-password',
    });

    await expect(
      service.reset('wrong-client-token', 'new secure password', clientId),
    ).rejects.toThrow('Invalid or expired password reset token.');
    expect(findUser).not.toHaveBeenCalled();
  });

  it('rejects reset tokens with malformed claims', async () => {
    verifyToken.mockResolvedValue({
      sub: '',
      clientId,
      email: user.email,
      passwordFingerprint: 'a'.repeat(64),
      purpose: 'reset-password',
    });

    await expect(
      service.reset('malformed-token', 'new secure password', clientId),
    ).rejects.toThrow(UnauthorizedException);
    expect(findUser).not.toHaveBeenCalled();
  });

  it('maps expired reset tokens to an authentication error', async () => {
    verifyToken.mockRejectedValue(
      Object.assign(new Error('expired'), { name: 'TokenExpiredError' }),
    );

    await expect(
      service.reset('expired-token', 'new secure password', clientId),
    ).rejects.toThrow('Invalid or expired password reset token.');
  });
});
