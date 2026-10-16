import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma.service.js';
import { toVarchar } from '../prisma/varchar.js';
import {
  REFRESH_TOKEN_BYTES,
  REFRESH_TOKEN_HASH_ALGORITHM,
  REFRESH_TOKEN_HASH_MAX_LENGTH,
  REFRESH_TOKEN_PATTERN,
} from './auth.constants.js';
import { AccessTokenService } from './access-token.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { PasswordService } from './password.service.js';

export interface AuthenticatedUserInfo {
  id: string;
  email: string;
}

export type RegistrationResult = AuthenticatedUserInfo;

export interface LoginResult {
  user: AuthenticatedUserInfo;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject('PRISMA_SERVICE') private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokenService,
    private readonly emailVerification: EmailVerificationService,
    private readonly passwordReset: PasswordResetService,
    private readonly config: ConfigService,
  ) {}

  async register(
    email: string,
    password: string,
    clientId: string,
  ): Promise<RegistrationResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(password);

    let user: { id: string; email: string; clientId: string };
    try {
      user = await this.prisma.client.transaction(async (transaction) => {
        const role = await transaction.orm.public.Role.where({
          name: toVarchar('user', 64),
        }).first();

        if (!role) {
          throw new Error(
            'The default user role is missing; run pnpm db:seed.',
          );
        }

        const createdUser = await transaction.orm.public.User.create({
          clientId,
          email: toVarchar(normalizedEmail, 320),
          passwordHash: toVarchar(passwordHash, 255),
        });

        await transaction.orm.public.UserRole.create({
          userId: createdUser.id,
          roleId: role.id,
        });

        return {
          id: createdUser.id,
          email: createdUser.email,
          clientId: createdUser.clientId,
        };
      });
    } catch (error) {
      if (isPostgresUniqueConstraintViolation(error)) {
        throw new ConflictException('Registration could not be completed.');
      }

      throw error;
    }

    await this.emailVerification.sendVerificationEmail({
      userId: user.id,
      clientId: user.clientId,
      email: user.email,
    });
    return { id: user.id, email: user.email };
  }

  async login(
    email: string,
    password: string,
    clientId: string,
  ): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.public.User.where({
      clientId,
      email: toVarchar(normalizedEmail, 320),
    }).first();

    if (
      !user ||
      !(await this.passwords.verify(password, user.passwordHash)) ||
      user.status !== 'ACTIVE' ||
      !user.emailVerifiedAt
    ) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const tokenHash = createHash(REFRESH_TOKEN_HASH_ALGORITHM)
      .update(refreshToken)
      .digest('hex');
    const expiresAt = new Date(
      Date.now() +
        this.config.getOrThrow<number>('REFRESH_SESSION_TTL_SECONDS') * 1000,
    );

    await this.prisma.public.RefreshSession.create({
      userId: user.id,
      tokenHash: toVarchar(tokenHash, REFRESH_TOKEN_HASH_MAX_LENGTH),
      expiresAt: expiresAt.toISOString(),
    });

    const accessToken = await this.accessTokens.issue(user.id, user.clientId);

    return {
      user: { id: user.id, email: user.email },
      accessToken,
      refreshToken,
    };
  }

  async logout(
    refreshToken: string | undefined,
    clientId: string,
  ): Promise<void> {
    if (!refreshToken || !REFRESH_TOKEN_PATTERN.test(refreshToken)) {
      return;
    }

    const tokenHash = createHash(REFRESH_TOKEN_HASH_ALGORITHM)
      .update(refreshToken)
      .digest('hex');
    const session = await this.prisma.public.RefreshSession.where({
      tokenHash: toVarchar(tokenHash, REFRESH_TOKEN_HASH_MAX_LENGTH),
    }).first();

    if (!session || session.revokedAt !== null) {
      return;
    }

    const user = await this.prisma.public.User.where({
      id: session.userId,
    }).first();

    if (!user || user.clientId !== clientId) {
      return;
    }

    await this.prisma.public.RefreshSession.where({
      id: session.id,
      revokedAt: null,
    }).update({ revokedAt: new Date().toISOString() });
  }

  async getCurrentUser(
    userId: string,
    clientId: string,
  ): Promise<{ id: string; email: string }> {
    const user = await this.prisma.public.User.where({
      id: userId,
      clientId,
    }).first();

    if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    return { id: user.id, email: user.email };
  }

  async resendVerificationEmail(
    email: string,
    clientId: string,
  ): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.public.User.where({
      clientId,
      email: toVarchar(normalizedEmail, 320),
    }).first();

    if (!user || user.status !== 'ACTIVE' || user.emailVerifiedAt !== null) {
      return;
    }

    await this.emailVerification.sendVerificationEmail({
      userId: user.id,
      clientId: user.clientId,
      email: user.email,
    });
  }

  async requestPasswordReset(email: string, clientId: string): Promise<void> {
    await this.passwordReset.request(email, clientId);
  }

  async resetPassword(
    token: string,
    password: string,
    clientId: string,
  ): Promise<void> {
    await this.passwordReset.reset(token, password, clientId);
  }

  async verifyEmail(token: string, clientId: string): Promise<void> {
    const claims = await this.emailVerification.verifyToken(token);
    if (claims.clientId !== clientId) {
      throw new UnauthorizedException('Invalid or expired verification token.');
    }

    const updatedUser = await this.prisma.public.User.where({
      id: claims.userId,
      clientId: claims.clientId,
      email: toVarchar(claims.email, 320),
      status: 'ACTIVE',
      emailVerifiedAt: null,
    }).update({ emailVerifiedAt: new Date().toISOString() });

    if (!updatedUser) {
      throw new UnauthorizedException('Invalid or expired verification token.');
    }
  }

  async refresh(refreshToken: string, clientId: string): Promise<LoginResult> {
    // Validate the opaque token before querying storage; only its hash is persisted.
    if (!REFRESH_TOKEN_PATTERN.test(refreshToken)) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const tokenHash = createHash(REFRESH_TOKEN_HASH_ALGORITHM)
      .update(refreshToken)
      .digest('hex');
    const now = new Date();
    const nowString = now.toISOString();
    // Prepare replacement credentials before the transaction can consume the old token.
    const rotatedToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const rotatedTokenHash = createHash(REFRESH_TOKEN_HASH_ALGORITHM)
      .update(rotatedToken)
      .digest('hex');
    const expiresAt = new Date(
      now.getTime() +
        this.config.getOrThrow<number>('REFRESH_SESSION_TTL_SECONDS') * 1000,
    );

    // Conditionally revoke the current row to ensure concurrent refreshes cannot both rotate it.
    const outcome = await this.prisma.client.transaction(
      async (transaction) => {
        const sessions = transaction.orm.public.RefreshSession;
        const session = await sessions
          .where({
            tokenHash: toVarchar(tokenHash, REFRESH_TOKEN_HASH_MAX_LENGTH),
          })
          .first();

        // Reject unknown tokens without revealing whether a session exists.
        if (!session) {
          return { kind: 'invalid' } as const;
        }

        // A revoked token proves replay; revoke the user's other active sessions too.
        if (session.revokedAt !== null) {
          await sessions
            .where({ userId: session.userId, revokedAt: null })
            .updateAll({ revokedAt: nowString });
          return { kind: 'reused' } as const;
        }

        // Expired sessions cannot be rotated.
        if (Date.parse(session.expiresAt) <= now.getTime()) {
          return { kind: 'invalid' } as const;
        }

        // Bind the refresh session to both an active account and its registered client.
        const user = await transaction.orm.public.User.where({
          id: session.userId,
        }).first();

        if (!user || user.clientId !== clientId) {
          return { kind: 'invalid' } as const;
        }

        // Disable refresh for inactive users and invalidate this session.
        if (user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
          await sessions
            .where({ id: session.id, revokedAt: null })
            .update({ revokedAt: nowString });
          return { kind: 'invalid' } as const;
        }

        // Consume only a still-active row; a null result means another request used it first.
        const revokedSession = await sessions
          .where({ id: session.id, revokedAt: null })
          .update({ revokedAt: nowString });

        if (!revokedSession) {
          await sessions
            .where({ userId: session.userId, revokedAt: null })
            .updateAll({ revokedAt: nowString });
          return { kind: 'reused' } as const;
        }

        // Store only the replacement token hash in the same transaction as revocation.
        await sessions.create({
          userId: user.id,
          tokenHash: toVarchar(rotatedTokenHash, REFRESH_TOKEN_HASH_MAX_LENGTH),
          expiresAt: expiresAt.toISOString(),
        });
        const accessToken = await this.accessTokens.issue(user.id, clientId);

        return {
          kind: 'rotated',
          user: { id: user.id, email: user.email },
          accessToken,
        } as const;
      },
    );

    if (outcome.kind !== 'rotated') {
      // Keep response details uniform for unknown, expired, disabled, and replayed tokens.
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    return {
      user: outcome.user,
      accessToken: outcome.accessToken,
      refreshToken: rotatedToken,
    };
  }
}

function isPostgresUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}
