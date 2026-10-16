import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  MinLength,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV = 'development';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsUrl({
    protocols: ['postgres', 'postgresql'],
    require_protocol: true,
    require_tld: false,
  })
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(3600)
  JWT_ACCESS_TTL_SECONDS = 900;

  @Type(() => Number)
  @IsInt()
  @Min(3600)
  @Max(7776000)
  REFRESH_SESSION_TTL_SECONDS = 2592000;

  @IsIn(['lax', 'strict', 'none'])
  AUTH_COOKIE_SAME_SITE: 'lax' | 'strict' | 'none' = 'lax';

  @Transform(({ value }) =>
    value == null || value === ''
      ? []
      : String(value)
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
  )
  @IsArray()
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_tld: false,
    },
    { each: true },
  )
  CORS_ORIGINS: string[] = [];

  @IsString()
  @MinLength(32)
  EMAIL_VERIFICATION_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(300)
  @Max(604800)
  EMAIL_VERIFICATION_TTL_SECONDS = 86400;

  @IsString()
  @MinLength(1)
  RESEND_API_KEY!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(320)
  AUTH_EMAIL_FROM!: string;

  @IsString()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  EMAIL_VERIFICATION_URL!: string;

  @IsString()
  @MinLength(32)
  PASSWORD_RESET_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(300)
  @Max(86400)
  PASSWORD_RESET_TTL_SECONDS = 900;

  @IsString()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  PASSWORD_RESET_URL!: string;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const environment = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(environment);

  if (errors.length > 0) {
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    throw new Error(
      `Invalid environment configuration: ${messages.join('; ')}`,
    );
  }

  if (
    environment.AUTH_COOKIE_SAME_SITE === 'none' &&
    environment.NODE_ENV !== 'production'
  ) {
    throw new Error(
      'Invalid environment configuration: SameSite=None cookies require production HTTPS.',
    );
  }

  for (const origin of environment.CORS_ORIGINS) {
    const parsedOrigin = new URL(origin);
    if (
      !['http:', 'https:'].includes(parsedOrigin.protocol) ||
      parsedOrigin.origin !== origin
    ) {
      throw new Error(
        'Invalid environment configuration: CORS_ORIGINS must contain only HTTP(S) origins without paths.',
      );
    }
  }

  if (
    environment.NODE_ENV === 'production' &&
    new URL(environment.EMAIL_VERIFICATION_URL).protocol !== 'https:'
  ) {
    throw new Error(
      'Invalid environment configuration: EMAIL_VERIFICATION_URL must use HTTPS in production.',
    );
  }

  if (
    environment.NODE_ENV === 'production' &&
    new URL(environment.PASSWORD_RESET_URL).protocol !== 'https:'
  ) {
    throw new Error(
      'Invalid environment configuration: PASSWORD_RESET_URL must use HTTPS in production.',
    );
  }

  if (environment.EMAIL_VERIFICATION_SECRET === environment.JWT_ACCESS_SECRET) {
    throw new Error(
      'Invalid environment configuration: email verification and access-token secrets must differ.',
    );
  }

  if (
    environment.PASSWORD_RESET_SECRET === environment.JWT_ACCESS_SECRET ||
    environment.PASSWORD_RESET_SECRET === environment.EMAIL_VERIFICATION_SECRET
  ) {
    throw new Error(
      'Invalid environment configuration: password-reset secret must differ from access-token and email-verification secrets.',
    );
  }

  return environment;
}
