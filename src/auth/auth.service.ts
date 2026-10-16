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
import { AccessTokenService } from './access-token.service.js';
import { PasswordService } from './password.service.js';

export interface RegistrationResult {
  user: {
    id: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
}

export type LoginResult = RegistrationResult;

@Injectable()
export class AuthService {
  constructor(
    @Inject('PRISMA_SERVICE') private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokenService,
    private readonly config: ConfigService,
  ) {}

  async register(
    email: string,
    password: string,
    clientId: string,
  ): Promise<RegistrationResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(password);
    const refreshToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(
      Date.now() +
        this.config.getOrThrow<number>('REFRESH_SESSION_TTL_SECONDS') * 1000,
    );

    try {
      const user = await this.prisma.client.transaction(async (transaction) => {
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

        await transaction.orm.public.RefreshSession.create({
          userId: createdUser.id,
          tokenHash: toVarchar(tokenHash, 128),
          expiresAt: expiresAt.toISOString(),
        });

        return { id: createdUser.id, email: createdUser.email };
      });

      const accessToken = await this.accessTokens.issue(user.id, clientId);

      return {
        user,
        accessToken,
        refreshToken,
      };
    } catch (error) {
      if (isPostgresUniqueConstraintViolation(error)) {
        throw new ConflictException('Registration could not be completed.');
      }

      throw error;
    }
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
      user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const refreshToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(
      Date.now() +
        this.config.getOrThrow<number>('REFRESH_SESSION_TTL_SECONDS') * 1000,
    );

    await this.prisma.public.RefreshSession.create({
      userId: user.id,
      tokenHash: toVarchar(tokenHash, 128),
      expiresAt: expiresAt.toISOString(),
    });

    const accessToken = await this.accessTokens.issue(user.id, user.clientId);

    return {
      user: { id: user.id, email: user.email },
      accessToken,
      refreshToken,
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
