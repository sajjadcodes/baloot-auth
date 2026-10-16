import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const secret = 'test-only-access-token-secret-32-characters';
  let strategy: JwtStrategy;

  beforeEach(() => {
    const config = new ConfigService({ JWT_ACCESS_SECRET: secret });
    strategy = new JwtStrategy(config);
  });

  it('maps a valid subject claim to the authenticated user', () => {
    expect(strategy.validate({ sub: 'user-123' })).toEqual({
      userId: 'user-123',
    });
  });

  it.each([null, {}, { sub: '' }, { sub: 123 }])(
    'rejects an invalid token payload: %p',
    (payload) => {
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    },
  );
});
