import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
            clientId,
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

    const accessToken = await this.accessTokens.issue(user.id, clientId);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  async login(
    email: string,
    password: string,
    clientId: string,
  ): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { clientId_email: { clientId, email: normalizedEmail } },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
        clientId: true,
      },
    });

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

    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const accessToken = await this.accessTokens.issue(user.id, user.clientId);

    return {
      user: { id: user.id, email: user.email },
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
