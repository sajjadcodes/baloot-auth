import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CLIENT_ID_HEADER } from '../auth.constants.js';
import type { AuthenticatedUser } from '../strategies/jwt.strategy.js';

@Injectable()
export class AdminClientGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const authenticatedUser = request.user;
    const clientId = request.get(CLIENT_ID_HEADER);

    if (
      !authenticatedUser ||
      !clientId ||
      authenticatedUser.clientId !== clientId
    ) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    return true;
  }
}
