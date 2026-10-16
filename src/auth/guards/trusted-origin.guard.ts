import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.get('origin');
    const allowedOrigins = this.config.getOrThrow<string[]>('CORS_ORIGINS');

    if (!origin || !allowedOrigins.includes(origin)) {
      throw new ForbiddenException('Untrusted request origin.');
    }

    return true;
  }
}
