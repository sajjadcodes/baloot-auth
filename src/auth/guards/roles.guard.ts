import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { PrismaService } from '../../database/prisma.service.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../strategies/jwt.strategy.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject('PRISMA_SERVICE') private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles === undefined) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const authenticatedUser = request.user;

    if (!authenticatedUser) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: authenticatedUser.userId,
        clientId: authenticatedUser.clientId,
      },
    });

    if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    if (requiredRoles.length === 0) {
      throw new ForbiddenException('Insufficient role.');
    }

    // Accept the request when the user holds any one of the declared roles.
    for (const roleName of requiredRoles) {
      // Join the assignment to the role so the check uses the current database state.
      const assignment = await this.prisma.userRole.findFirst({
        where: { userId: user.id, role: { is: { name: roleName } } },
        select: { userId: true },
      });

      if (assignment) {
        // A single matching assignment is sufficient; remaining roles need no query.
        return true;
      }
    }

    throw new ForbiddenException('Insufficient role.');
  }
}
