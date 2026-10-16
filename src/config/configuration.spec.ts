import 'reflect-metadata';
import { validateEnvironment } from './configuration.js';

describe('validateEnvironment', () => {
  const databaseUrl =
    'postgresql://postgres:postgres@localhost:5432/baloot_auth';
  const accessSecret = 'test-only-access-token-secret-32-characters';
  const emailConfig = {
    EMAIL_VERIFICATION_SECRET:
      'test-only-email-verification-secret-32-characters',
    RESEND_API_KEY: 're_test_api_key',
    AUTH_EMAIL_FROM: 'Baloot Auth <auth@example.com>',
    EMAIL_VERIFICATION_URL: 'http://localhost:5173/verify-email',
  };

  function validateWithEmailConfig(config: Record<string, unknown>) {
    return validateEnvironment({ ...emailConfig, ...config });
  }

  it('applies defaults and parses the database URL', () => {
    const environment = validateWithEmailConfig({
      DATABASE_URL: databaseUrl,
      JWT_ACCESS_SECRET: accessSecret,
    });

    expect(environment.NODE_ENV).toBe('development');
    expect(environment.PORT).toBe(3000);
    expect(environment.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(environment.REFRESH_SESSION_TTL_SECONDS).toBe(2592000);
    expect(environment.AUTH_COOKIE_SAME_SITE).toBe('lax');
    expect(environment.CORS_ORIGINS).toEqual([]);
    expect(environment.EMAIL_VERIFICATION_TTL_SECONDS).toBe(86400);
  });

  it('parses and validates explicit values', () => {
    const environment = validateWithEmailConfig({
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
      validateWithEmailConfig({
        PORT: '70000',
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: accessSecret,
        CORS_ORIGINS: '*',
      }),
    ).toThrow('Invalid environment configuration');

    expect(() =>
      validateWithEmailConfig({
        DATABASE_URL: 'https://example.com',
        JWT_ACCESS_SECRET: accessSecret,
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('rejects short JWT secrets and access-token lifetimes outside the allowed range', () => {
    expect(() =>
      validateWithEmailConfig({
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: 'too-short',
      }),
    ).toThrow('Invalid environment configuration');

    expect(() =>
      validateWithEmailConfig({
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: accessSecret,
        JWT_ACCESS_TTL_SECONDS: '30',
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('rejects CORS entries that are URLs rather than origins', () => {
    expect(() =>
      validateWithEmailConfig({
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: accessSecret,
        CORS_ORIGINS: 'https://app.example.com/path',
      }),
    ).toThrow('CORS_ORIGINS must contain only HTTP(S) origins without paths');
  });

  it('requires production mode for SameSite=None cookies', () => {
    expect(() =>
      validateWithEmailConfig({
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: accessSecret,
        AUTH_COOKIE_SAME_SITE: 'none',
      }),
    ).toThrow('SameSite=None cookies require production HTTPS');
  });

  it('requires HTTPS email verification URLs in production', () => {
    expect(() =>
      validateWithEmailConfig({
        NODE_ENV: 'production',
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: accessSecret,
        EMAIL_VERIFICATION_URL: 'http://app.example.com/verify-email',
      }),
    ).toThrow('EMAIL_VERIFICATION_URL must use HTTPS in production');
  });

  it('requires a separate email verification signing secret', () => {
    expect(() =>
      validateWithEmailConfig({
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: emailConfig.EMAIL_VERIFICATION_SECRET,
      }),
    ).toThrow('email verification and access-token secrets must differ');
  });
});
