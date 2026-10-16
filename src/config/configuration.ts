import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsString,
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

  return environment;
}
