import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma.service.js';
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

export interface AdminUserInfo extends AuthenticatedUserInfo {
  status: 'ACTIVE' | 'DISABLED';
  emailVerifiedAt: string | null;
  createdAt: string;
  roles: string[];
}

export interface AdminSessionInfo {
  id: string;
  createdAt: string;
  expiresAt: string;
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
      user = await this.prisma.$transaction(async (transaction) => {
        const role = await transaction.role.findFirst({
          where: {
            name: 'user',
          },
        });

        if (!role) {
          throw new Error(
            'The default user role is missing; run pnpm db:seed.',
          );
        }

        const createdUser = await transaction.user.create({
          data: { clientId, email: normalizedEmail, passwordHash },
        });

        await transaction.userRole.create({
          data: { userId: createdUser.id, roleId: role.id },
        });

        return {
          id: createdUser.id,
          email: createdUser.email,
          clientId: createdUser.clientId,
        };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
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
    const user = await this.prisma.user.findFirst({
      where: {
        clientId,
        email: normalizedEmail,
      },
    });

    if (
      !user ||
      !(await this.passwords.verify(password, user.passwordHash)) ||
      user.status !== 'ACTIVE' ||
      !user.emailVerifiedAt
    ) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const tokenHash = hashRefreshToken(refreshToken);
    const sessionId = randomUUID();
    const expiresAt = new Date(
      Date.now() +
        this.config.getOrThrow<number>('REFRESH_SESSION_TTL_SECONDS') * 1000,
    );

    await this.prisma.$transaction(async (transaction) => {
      await transaction.authSession.create({
        data: { id: sessionId, userId: user.id, expiresAt },
      });
      await transaction.refreshSession.create({
        data: { userId: user.id, sessionId, tokenHash, expiresAt },
      });
    });

    const accessToken = await this.accessTokens.issue(
      user.id,
      user.clientId,
      sessionId,
    );

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

    const tokenHash = hashRefreshToken(refreshToken);
    await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.refreshSession.findFirst({
        where: {
          tokenHash: tokenHash,
        },
      });

      if (!session) {
        return;
      }

      const user = await transaction.user.findFirst({
        where: {
          id: session.userId,
        },
      });

      if (!user || user.clientId !== clientId) {
        return;
      }

      const now = new Date();
      await transaction.authSession.updateMany({
        where: {
          id: session.sessionId,
          userId: session.userId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      await transaction.refreshSession.updateMany({
        where: {
          sessionId: session.sessionId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
    });
  }

  async getCurrentUser(
    userId: string,
    clientId: string,
  ): Promise<{ id: string; email: string }> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        clientId,
      },
    });

    if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    return { id: user.id, email: user.email };
  }

  async getClientUserForAdmin(
    targetUserId: string,
    clientId: string,
  ): Promise<AdminUserInfo> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        clientId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const roles: string[] = [];
    for (const roleName of ['user', 'platform_admin']) {
      const assignment = await this.prisma.userRole.findFirst({
        where: { userId: user.id, role: { is: { name: roleName } } },
        select: { userId: true },
      });

      if (assignment) {
        roles.push(roleName);
      }
    }

    return {
      id: user.id,
      email: user.email,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      roles,
    };
  }

  async getClientUserSessions(
    targetUserId: string,
    clientId: string,
  ): Promise<AdminSessionInfo[]> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        clientId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const now = Date.now();
    const sessions = await this.prisma.authSession.findMany({
      where: { userId: user.id, revokedAt: null },
      select: { id: true, createdAt: true, expiresAt: true },
    });

    return sessions
      .filter((session) => session.expiresAt.getTime() > now)
      .map((session) => ({
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
      }));
  }

  async disableClientUser(
    actorUserId: string,
    targetUserId: string,
    clientId: string,
  ): Promise<void> {
    if (actorUserId === targetUserId) {
      throw new ForbiddenException('Administrators cannot disable themselves.');
    }

    await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: {
          id: targetUserId,
          clientId,
        },
      });

      if (!user) {
        throw new NotFoundException('User not found.');
      }

      const now = new Date();
      await transaction.user.updateMany({
        where: {
          id: user.id,
          clientId,
        },
        data: { status: 'DISABLED' },
      });
      await transaction.authSession.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      await transaction.refreshSession.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      await transaction.adminAuditEvent.create({
        data: {
          clientId,
          actorUserId,
          targetUserId: user.id,
          action: 'USER_DISABLED',
        },
      });
    });
  }

  async enableClientUser(
    actorUserId: string,
    targetUserId: string,
    clientId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: {
          id: targetUserId,
          clientId,
        },
      });

      if (!user) {
        throw new NotFoundException('User not found.');
      }

      await transaction.user.updateMany({
        where: {
          id: user.id,
          clientId,
        },
        data: { status: 'ACTIVE' },
      });
      await transaction.adminAuditEvent.create({
        data: {
          clientId,
          actorUserId,
          targetUserId: user.id,
          action: 'USER_ENABLED',
        },
      });
    });
  }

  async revokeClientUserSession(
    actorUserId: string,
    targetUserId: string,
    clientId: string,
    sessionId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: {
          id: targetUserId,
          clientId,
        },
      });

      if (!user) {
        throw new NotFoundException('User not found.');
      }

      const session = await transaction.authSession.findFirst({
        where: {
          id: sessionId,
          userId: user.id,
          revokedAt: null,
        },
      });

      if (!session || session.expiresAt.getTime() <= Date.now()) {
        throw new NotFoundException('Active session not found.');
      }

      const now = new Date();
      await transaction.authSession.updateMany({
        where: {
          id: session.id,
          userId: user.id,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      await transaction.refreshSession.updateMany({
        where: {
          sessionId: session.id,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      await transaction.adminAuditEvent.create({
        data: {
          clientId,
          actorUserId,
          targetUserId: user.id,
          action: 'SESSION_REVOKED',
          sessionId: session.id,
        },
      });
    });
  }

  async resendVerificationEmail(
    email: string,
    clientId: string,
  ): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        clientId,
        email: normalizedEmail,
      },
    });

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

    const updatedUser = await this.prisma.user.updateMany({
      where: {
        id: claims.userId,
        clientId: claims.clientId,
        email: claims.email,
        status: 'ACTIVE',
        emailVerifiedAt: null,
      },
      data: { emailVerifiedAt: new Date() },
    });

    if (updatedUser.count === 0) {
      throw new UnauthorizedException('Invalid or expired verification token.');
    }
  }

  async refresh(refreshToken: string, clientId: string): Promise<LoginResult> {
    // Validate the opaque token before querying storage; only its hash is persisted.
    if (!REFRESH_TOKEN_PATTERN.test(refreshToken)) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const now = new Date();
    // Prepare replacement credentials before the transaction can consume the old token.
    const rotatedToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const rotatedTokenHash = hashRefreshToken(rotatedToken);
    const expiresAt = new Date(
      now.getTime() +
        this.config.getOrThrow<number>('REFRESH_SESSION_TTL_SECONDS') * 1000,
    );

    // Conditionally revoke the current row to ensure concurrent refreshes cannot both rotate it.
    const outcome = await this.prisma.$transaction(async (transaction) => {
      const sessions = transaction.refreshSession;
      const session = await sessions.findFirst({
        where: {
          tokenHash,
        },
      });

      // Reject unknown tokens without revealing whether a session exists.
      if (!session) {
        return { kind: 'invalid' } as const;
      }

      // A revoked token proves replay; revoke the user's other active sessions too.
      if (session.revokedAt !== null) {
        await transaction.authSession.updateMany({
          where: {
            userId: session.userId,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
        await sessions.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: now },
        });
        return { kind: 'reused' } as const;
      }

      // Expired sessions cannot be rotated.
      if (session.expiresAt.getTime() <= now.getTime()) {
        return { kind: 'invalid' } as const;
      }

      const authSession = await transaction.authSession.findFirst({
        where: {
          id: session.sessionId,
          userId: session.userId,
          revokedAt: null,
        },
      });

      if (!authSession || authSession.expiresAt.getTime() <= now.getTime()) {
        return { kind: 'invalid' } as const;
      }

      // Bind the refresh session to both an active account and its registered client.
      const user = await transaction.user.findFirst({
        where: {
          id: session.userId,
        },
      });

      if (!user || user.clientId !== clientId) {
        return { kind: 'invalid' } as const;
      }

      // Disable refresh for inactive users and invalidate this session.
      if (user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
        await transaction.authSession.updateMany({
          where: {
            id: authSession.id,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
        await sessions.updateMany({
          where: { sessionId: session.sessionId, revokedAt: null },
          data: { revokedAt: now },
        });
        return { kind: 'invalid' } as const;
      }

      // Consume only a still-active row; a null result means another request used it first.
      const revokedSession = await sessions.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      });

      if (revokedSession.count === 0) {
        await transaction.authSession.updateMany({
          where: {
            userId: session.userId,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
        await sessions.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: now },
        });
        return { kind: 'reused' } as const;
      }

      const renewedAuthSession = await transaction.authSession.updateMany({
        where: {
          id: authSession.id,
          revokedAt: null,
        },
        data: { expiresAt },
      });

      if (renewedAuthSession.count === 0) {
        return { kind: 'invalid' } as const;
      }

      // Store only the replacement token hash in the same transaction as revocation.
      await sessions.create({
        data: {
          userId: user.id,
          sessionId: authSession.id,
          tokenHash: rotatedTokenHash,
          expiresAt,
        },
      });
      const accessToken = await this.accessTokens.issue(
        user.id,
        clientId,
        authSession.id,
      );

      return {
        kind: 'rotated',
        user: { id: user.id, email: user.email },
        accessToken,
      } as const;
    });

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

function hashRefreshToken(token: string): string {
  const hash = createHash(REFRESH_TOKEN_HASH_ALGORITHM)
    .update(token)
    .digest('hex');

  if (Buffer.byteLength(hash, 'utf8') > REFRESH_TOKEN_HASH_MAX_LENGTH) {
    throw new RangeError(
      'Refresh-token hash exceeds the database column limit.',
    );
  }

  return hash;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'P2002' || error.code === '23505')
  );
}
