import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { PrismaService } from '../../database/prisma.service.js';
import { toVarchar } from '../../prisma/varchar.js';
import { CLIENT_ID_HEADER, CLIENT_ID_PATTERN } from '../auth.constants.js';

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    @Inject('PRISMA_SERVICE') private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.get('origin');
    const clientId = request.get(CLIENT_ID_HEADER);
    const allowedOrigins = this.config.getOrThrow<string[]>('CORS_ORIGINS');

    if (
      !origin ||
      origin.length > 512 ||
      !allowedOrigins.includes(origin) ||
      !clientId ||
      !CLIENT_ID_PATTERN.test(clientId)
    ) {
      throw new ForbiddenException('Untrusted client request.');
    }

    const client = await this.prisma.public.Client.include(
      'allowedOrigins',
      (allowedOrigins) =>
        allowedOrigins.where({ origin: toVarchar(origin, 512) }),
    )
      .where({ id: clientId })
      .first();

    if (
      !client ||
      client.status !== 'ACTIVE' ||
      client.allowedOrigins.length === 0
    ) {
      throw new ForbiddenException('Untrusted client request.');
    }

    return true;
  }
}
