import 'reflect-metadata';
import { validateEnvironment } from './configuration';

describe('validateEnvironment', () => {
  const databaseUrl =
    'postgresql://postgres:postgres@localhost:5432/baloot_auth';
  const accessSecret = 'test-only-access-token-secret-32-characters';

  it('applies defaults and parses the database URL', () => {
    const environment = validateEnvironment({
      DATABASE_URL: databaseUrl,
      JWT_ACCESS_SECRET: accessSecret,
    });

    expect(environment.NODE_ENV).toBe('development');
    expect(environment.PORT).toBe(3000);
    expect(environment.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(environment.REFRESH_SESSION_TTL_SECONDS).toBe(2592000);
    expect(environment.AUTH_COOKIE_SAME_SITE).toBe('lax');
    expect(environment.CORS_ORIGINS).toEqual([]);
  });

  it('parses and validates explicit values', () => {
    const environment = validateEnvironment({
      NODE_ENV: 'test',
      PORT: '4000',
      DATABASE_URL: databaseUrl,
      JWT_ACCESS_SECRET: accessSecret,
      JWT_ACCESS_TTL_SECONDS: '600',
      REFRESH_SESSION_TTL_SECONDS: '604800',
      AUTH_COOKIE_SAME_SITE: 'strict',
      CORS_ORIGINS: 'http://localhost:5173,https://app.example.com',
    });

    expect(environment.PORT).toBe(4000);
    expect(environment.JWT_ACCESS_TTL_SECONDS).toBe(600);
    expect(environment.REFRESH_SESSION_TTL_SECONDS).toBe(604800);
    expect(environment.AUTH_COOKIE_SAME_SITE).toBe('strict');
    expect(environment.CORS_ORIGINS).toEqual([
      'http://localhost:5173',
      'https://app.example.com',
    ]);
  });

  it('rejects invalid ports, database URLs, and wildcard origins', () => {
    expect(() =>
      validateEnvironment({
        PORT: '70000',
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: accessSecret,
        CORS_ORIGINS: '*',
      }),
    ).toThrow('Invalid environment configuration');

    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'https://example.com',
        JWT_ACCESS_SECRET: accessSecret,
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('rejects short JWT secrets and access-token lifetimes outside the allowed range', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: 'too-short',
      }),
    ).toThrow('Invalid environment configuration');

    expect(() =>
      validateEnvironment({
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: accessSecret,
        JWT_ACCESS_TTL_SECONDS: '30',
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('rejects CORS entries that are URLs rather than origins', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: accessSecret,
        CORS_ORIGINS: 'https://app.example.com/path',
      }),
    ).toThrow('CORS_ORIGINS must contain only HTTP(S) origins without paths');
  });

  it('requires production mode for SameSite=None cookies', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: accessSecret,
        AUTH_COOKIE_SAME_SITE: 'none',
      }),
    ).toThrow('SameSite=None cookies require production HTTPS');
  });
});
