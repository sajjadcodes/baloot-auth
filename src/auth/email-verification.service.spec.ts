import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  EMAIL_VERIFICATION_AUDIENCE,
  EMAIL_VERIFICATION_ISSUER,
  EMAIL_VERIFICATION_PURPOSE,
} from './auth.constants.js';
import { EmailVerificationService } from './email-verification.service.js';

describe('EmailVerificationService', () => {
  const secret = 'test-only-email-verification-secret-32-characters';
  const user = {
    userId: 'user-1',
    clientId: '00000000-0000-4000-8000-000000000001',
    email: 'person@example.com',
  };
  const jwt = new JwtService();
  const service = new EmailVerificationService(
    new ConfigService({ EMAIL_VERIFICATION_SECRET: secret }),
    jwt,
  );

  async function createToken(
    payload: Record<string, unknown> = {
      clientId: user.clientId,
      email: user.email,
      purpose: EMAIL_VERIFICATION_PURPOSE,
    },
    expiresIn: number | string = 60,
  ): Promise<string> {
    return jwt.signAsync(payload, {
      secret,
      expiresIn,
      issuer: EMAIL_VERIFICATION_ISSUER,
      audience: EMAIL_VERIFICATION_AUDIENCE,
      subject: user.userId,
    });
  }

  it('validates a signed, purpose-bound verification token', async () => {
    const token = await createToken();

    await expect(service.verifyToken(token)).resolves.toEqual(user);
  });

  it('rejects an expired verification token', async () => {
    const token = await createToken(undefined, -1);

    await expect(service.verifyToken(token)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed for a different purpose', async () => {
    const token = await createToken({
      clientId: user.clientId,
      email: user.email,
      purpose: 'access',
    });

    await expect(service.verifyToken(token)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects malformed token claims', async () => {
    const token = await createToken({
      clientId: '',
      email: user.email,
      purpose: EMAIL_VERIFICATION_PURPOSE,
    });

    await expect(service.verifyToken(token)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
