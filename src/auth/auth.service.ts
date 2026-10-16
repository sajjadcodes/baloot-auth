import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma.service';
import { AccessTokenService } from './access-token.service';
import { PasswordService } from './password.service';

export interface RegistrationResult {
  user: {
    id: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject('PRISMA_SERVICE') private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokenService,
    private readonly config: ConfigService,
  ) {}

  async register(email: string, password: string): Promise<RegistrationResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(password);
    const refreshToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(
      Date.now() +
        this.config.getOrThrow<number>('REFRESH_SESSION_TTL_SECONDS') * 1000,
    );

    let user: RegistrationResult['user'];

    try {
      user = await this.prisma.$transaction(async (transaction) => {
        const role = await transaction.role.upsert({
          where: { name: 'user' },
          update: {},
          create: { name: 'user' },
          select: { id: true },
        });

        const createdUser = await transaction.user.create({
          data: {
            email: normalizedEmail,
            passwordHash,
            roles: {
              create: {
                role: { connect: { id: role.id } },
              },
            },
          },
          select: { id: true, email: true },
        });

        await transaction.refreshSession.create({
          data: {
            userId: createdUser.id,
            tokenHash,
            expiresAt,
          },
        });

        return createdUser;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Registration could not be completed.');
      }

      throw error;
    }

    const accessToken = await this.accessTokens.issue(user.id);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002' &&
    'clientVersion' in error &&
    typeof error.clientVersion === 'string'
  );
}
