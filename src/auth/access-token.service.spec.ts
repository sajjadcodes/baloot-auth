import 'reflect-metadata';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenService } from './access-token.service.js';

describe('AccessTokenService', () => {
  const secret = 'test-only-access-token-secret-32-characters';
  const sessionId = '00000000-0000-4000-8000-000000000001';
  let jwtService: JwtService;
  let accessTokenService: AccessTokenService;

  beforeEach(() => {
    jwtService = new JwtService({
      secret,
      signOptions: { algorithm: 'HS256', expiresIn: 900 },
    });
    accessTokenService = new AccessTokenService(jwtService);
  });

  it('issues a signed token bound to its session with a short expiration', async () => {
    const token = await accessTokenService.issue(
      'user-123',
      'client-123',
      sessionId,
    );
    const payload = await jwtService.verifyAsync<{
      sub: string;
      clientId: string;
      sessionId: string;
      exp: number;
    }>(token, { secret, algorithms: ['HS256'] });

    expect(payload.sub).toBe('user-123');
    expect(payload.clientId).toBe('client-123');
    expect(payload.sessionId).toBe(sessionId);
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(payload.exp).toBeLessThanOrEqual(
      Math.floor(Date.now() / 1000) + 900,
    );
  });

  it.each([
    [' ', 'client-123', sessionId],
    ['user-123', ' ', sessionId],
    ['user-123', 'client-123', ' '],
  ])('does not issue a token without all IDs', async (userId, clientId, id) => {
    await expect(
      accessTokenService.issue(userId, clientId, id),
    ).rejects.toThrow(
      'A user ID, client ID, and session ID are required to issue an access token.',
    );
  });
});
