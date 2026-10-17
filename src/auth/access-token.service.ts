import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AccessTokenService {
  constructor(private readonly jwtService: JwtService) {}

  async issue(
    userId: string,
    clientId: string,
    sessionId: string,
  ): Promise<string> {
    if (
      typeof userId !== 'string' ||
      userId.trim().length === 0 ||
      typeof clientId !== 'string' ||
      clientId.trim().length === 0 ||
      typeof sessionId !== 'string' ||
      sessionId.trim().length === 0
    ) {
      throw new TypeError(
        'A user ID, client ID, and session ID are required to issue an access token.',
      );
    }

    return this.jwtService.signAsync({ sub: userId, clientId, sessionId });
  }
}
