import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EmailDeliveryService } from './email-delivery.service.js';
import {
  ACCESS_TOKEN_ALGORITHM,
  EMAIL_VERIFICATION_AUDIENCE,
  EMAIL_VERIFICATION_ISSUER,
  EMAIL_VERIFICATION_PURPOSE,
} from './auth.constants.js';

export interface EmailVerificationClaims {
  userId: string;
  clientId: string;
  email: string;
}

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly emailDelivery: EmailDeliveryService,
  ) {}

  async sendVerificationEmail(user: EmailVerificationClaims): Promise<void> {
    const token = await this.jwt.signAsync(
      {
        clientId: user.clientId,
        email: user.email,
        purpose: EMAIL_VERIFICATION_PURPOSE,
      },
      {
        secret: this.config.getOrThrow<string>('EMAIL_VERIFICATION_SECRET'),
        expiresIn: this.config.getOrThrow<number>(
          'EMAIL_VERIFICATION_TTL_SECONDS',
        ),
        issuer: EMAIL_VERIFICATION_ISSUER,
        audience: EMAIL_VERIFICATION_AUDIENCE,
        subject: user.userId,
        algorithm: ACCESS_TOKEN_ALGORITHM,
      },
    );
    const verificationUrl = new URL(
      this.config.getOrThrow<string>('EMAIL_VERIFICATION_URL'),
    );
    verificationUrl.hash = new URLSearchParams({ token }).toString();

    await this.emailDelivery.send({
      to: user.email,
      subject: 'Verify your email address',
      text: `Verify your email address by opening this link: ${verificationUrl.toString()}`,
      html: `<p>Verify your email address to finish creating your account.</p><p><a href="${escapeHtml(verificationUrl.toString())}">Verify email</a></p><p>This link expires in ${Math.ceil(this.config.getOrThrow<number>('EMAIL_VERIFICATION_TTL_SECONDS') / 3600)} hour(s).</p>`,
    });
  }

  async verifyToken(token: string): Promise<EmailVerificationClaims> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.config.getOrThrow<string>('EMAIL_VERIFICATION_SECRET'),
        issuer: EMAIL_VERIFICATION_ISSUER,
        audience: EMAIL_VERIFICATION_AUDIENCE,
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
          'Invalid or expired verification token.',
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
      payload.purpose !== EMAIL_VERIFICATION_PURPOSE
    ) {
      throw new UnauthorizedException('Invalid or expired verification token.');
    }

    return {
      userId: payload.sub,
      clientId: payload.clientId,
      email: payload.email,
    };
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
