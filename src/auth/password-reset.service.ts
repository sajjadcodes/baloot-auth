import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../database/prisma.service.js';
import { toVarchar } from '../prisma/varchar.js';
import {
  ACCESS_TOKEN_ALGORITHM,
  PASSWORD_RESET_AUDIENCE,
  PASSWORD_RESET_ISSUER,
  PASSWORD_RESET_PURPOSE,
} from './auth.constants.js';
import { EmailDeliveryService } from './email-delivery.service.js';
import { PasswordService } from './password.service.js';

interface PasswordResetClaims {
  userId: string;
  clientId: string;
  email: string;
  passwordFingerprint: string;
}

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    @Inject('PRISMA_SERVICE') private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly emailDelivery: EmailDeliveryService,
  ) {}

  async request(email: string, clientId: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.public.User.where({
      clientId,
      email: toVarchar(normalizedEmail, 320),
    }).first();

    if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
      return;
    }

    const passwordFingerprint = this.fingerprint(user.passwordHash);
    const token = await this.jwt.signAsync(
      {
        clientId: user.clientId,
        email: user.email,
        passwordFingerprint,
        purpose: PASSWORD_RESET_PURPOSE,
      },
      {
        secret: this.config.getOrThrow<string>('PASSWORD_RESET_SECRET'),
        expiresIn: this.config.getOrThrow<number>('PASSWORD_RESET_TTL_SECONDS'),
        issuer: PASSWORD_RESET_ISSUER,
        audience: PASSWORD_RESET_AUDIENCE,
        subject: user.id,
        algorithm: ACCESS_TOKEN_ALGORITHM,
      },
    );
    const resetUrl = new URL(
      this.config.getOrThrow<string>('PASSWORD_RESET_URL'),
    );
    resetUrl.hash = new URLSearchParams({ token }).toString();

    await this.emailDelivery.send({
      to: user.email,
      subject: 'Reset your password',
      text: `Reset your password by opening this link: ${resetUrl.toString()}`,
      html: `<p>A password reset was requested for your account.</p><p><a href="${escapeHtml(resetUrl.toString())}">Reset password</a></p><p>This link expires in ${Math.ceil(this.config.getOrThrow<number>('PASSWORD_RESET_TTL_SECONDS') / 60)} minute(s).</p><p>If you did not request this, you can ignore this email.</p>`,
    });
  }

  async reset(
    token: string,
    password: string,
    clientId: string,
  ): Promise<void> {
    const claims = await this.verifyToken(token);
    if (claims.clientId !== clientId) {
      throw new UnauthorizedException(
        'Invalid or expired password reset token.',
      );
    }

    const user = await this.prisma.public.User.where({
      id: claims.userId,
      clientId: claims.clientId,
      email: toVarchar(claims.email, 320),
      status: 'ACTIVE',
    }).first();

    if (
      !user ||
      !user.emailVerifiedAt ||
      !this.matchesFingerprint(claims.passwordFingerprint, user.passwordHash)
    ) {
      throw new UnauthorizedException(
        'Invalid or expired password reset token.',
      );
    }

    const passwordHash = await this.passwords.hash(password);
    const now = new Date().toISOString();

    await this.prisma.client.transaction(async (transaction) => {
      const updatedUser = await transaction.orm.public.User.where({
        id: user.id,
        clientId: user.clientId,
        email: toVarchar(user.email, 320),
        status: 'ACTIVE',
        passwordHash: toVarchar(user.passwordHash, 255),
      }).update({ passwordHash: toVarchar(passwordHash, 255) });

      if (!updatedUser) {
        throw new UnauthorizedException(
          'Invalid or expired password reset token.',
        );
      }

      await transaction.orm.public.RefreshSession.where({
        userId: user.id,
        revokedAt: null,
      }).updateAll({ revokedAt: now });
      await transaction.orm.public.AuthSession.where({
        userId: user.id,
        revokedAt: null,
      }).updateAll({ revokedAt: now });
    });
  }

  private async verifyToken(token: string): Promise<PasswordResetClaims> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.config.getOrThrow<string>('PASSWORD_RESET_SECRET'),
        issuer: PASSWORD_RESET_ISSUER,
        audience: PASSWORD_RESET_AUDIENCE,
        algorithms: [ACCESS_TOKEN_ALGORITHM],
      });
    } catch (error) {
      if (
        error instanceof Error &&
        ['JsonWebTokenError', 'NotBeforeError', 'TokenExpiredError'].includes(
          error.name,
        )
      ) {
        throw new UnauthorizedException(
          'Invalid or expired password reset token.',
        );
      }
      throw error;
    }

    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      typeof payload.clientId !== 'string' ||
      payload.clientId.length === 0 ||
      typeof payload.email !== 'string' ||
      payload.email.length === 0 ||
      typeof payload.passwordFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(payload.passwordFingerprint) ||
      payload.purpose !== PASSWORD_RESET_PURPOSE
    ) {
      throw new UnauthorizedException(
        'Invalid or expired password reset token.',
      );
    }

    return {
      userId: payload.sub,
      clientId: payload.clientId,
      email: payload.email,
      passwordFingerprint: payload.passwordFingerprint,
    };
  }

  private fingerprint(passwordHash: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('PASSWORD_RESET_SECRET'),
    )
      .update(passwordHash)
      .digest('hex');
  }

  // Validate that the reset token still matches the user's current password hash.
  private matchesFingerprint(
    fingerprint: string,
    passwordHash: string,
  ): boolean {
    // Compare fixed-size byte buffers so token validity does not leak through string timing.
    const expected = Buffer.from(this.fingerprint(passwordHash), 'hex');
    const actual = Buffer.from(fingerprint, 'hex');
    // timingSafeEqual throws for different lengths; reject those before comparing.
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}
