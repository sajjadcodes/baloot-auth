import 'reflect-metadata';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  const secret = 'test-only-access-token-secret-32-characters';
  let jwtService: JwtService;
  let accessTokenService: AccessTokenService;

  beforeEach(() => {
    jwtService = new JwtService({
      secret,
      signOptions: { algorithm: 'HS256', expiresIn: 900 },
    });
    accessTokenService = new AccessTokenService(jwtService);
  });

  it('issues a signed token with the user ID and a short expiration', async () => {
    const token = await accessTokenService.issue('user-123');
    const payload = await jwtService.verifyAsync<{ sub: string; exp: number }>(
      token,
      { secret, algorithms: ['HS256'] },
    );

    expect(payload.sub).toBe('user-123');
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(payload.exp).toBeLessThanOrEqual(
      Math.floor(Date.now() / 1000) + 900,
    );
  });

  it('does not issue a token without a user ID', async () => {
    await expect(accessTokenService.issue(' ')).rejects.toThrow(
      'A user ID is required to issue an access token.',
    );
  });
});
