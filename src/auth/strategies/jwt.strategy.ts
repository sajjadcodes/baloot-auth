import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { PrismaService } from '../../database/prisma.service.js';
import {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_COOKIE,
  BEARER_TOKEN_PATTERN,
} from '../auth.constants.js';

export interface AuthenticatedUser {
  userId: string;
  clientId: string;
  sessionId: string;
}

export function extractAccessToken(request: Request): string | null {
  if (typeof request.cookies?.[ACCESS_TOKEN_COOKIE] === 'string') {
    const cookieToken = request.cookies[ACCESS_TOKEN_COOKIE];
    if (cookieToken.length > 0) {
      return cookieToken;
    }
  }

  const authorization = request.headers.authorization;
  const match =
    typeof authorization === 'string'
      ? authorization.match(BEARER_TOKEN_PATTERN)
      : null;
  return match?.[1] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @Inject('PRISMA_SERVICE') private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: extractAccessToken,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      algorithms: [ACCESS_TOKEN_ALGORITHM],
    });
  }

  async validate(payload: unknown): Promise<AuthenticatedUser> {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('sub' in payload) ||
      typeof payload.sub !== 'string' ||
      payload.sub.trim().length === 0 ||
      !('clientId' in payload) ||
      typeof payload.clientId !== 'string' ||
      payload.clientId.trim().length === 0 ||
      !('sessionId' in payload) ||
      typeof payload.sessionId !== 'string' ||
      !UUID_PATTERN.test(payload.sessionId)
    ) {
      throw new UnauthorizedException('Invalid access token.');
    }

    const session = await this.prisma.public.AuthSession.where({
      id: payload.sessionId,
      userId: payload.sub,
      revokedAt: null,
    }).first();

    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    const user = await this.prisma.public.User.where({
      id: payload.sub,
      clientId: payload.clientId,
    }).first();

    if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    return {
      userId: payload.sub,
      clientId: payload.clientId,
      sessionId: payload.sessionId,
    };
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
