import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_COOKIE,
  BEARER_TOKEN_PATTERN,
} from '../auth.constants.js';

export interface AuthenticatedUser {
  userId: string;
  clientId: string;
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
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: extractAccessToken,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      algorithms: [ACCESS_TOKEN_ALGORITHM],
    });
  }

  validate(payload: unknown): AuthenticatedUser {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('sub' in payload) ||
      typeof payload.sub !== 'string' ||
      payload.sub.trim().length === 0 ||
      !('clientId' in payload) ||
      typeof payload.clientId !== 'string' ||
      payload.clientId.trim().length === 0
    ) {
      throw new UnauthorizedException('Invalid access token.');
    }

    return { userId: payload.sub, clientId: payload.clientId };
  }
}
