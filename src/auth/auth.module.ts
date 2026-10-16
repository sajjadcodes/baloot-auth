import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller.js';
import { AuthCookiesService } from './auth-cookies.service.js';
import { AccessTokenService } from './access-token.service.js';
import { AuthService } from './auth.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { TrustedOriginGuard } from './guards/trusted-origin.guard.js';
import { PasswordService } from './password.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import {
  ACCESS_TOKEN_ALGORITHM,
  AUTH_GLOBAL_RATE_LIMIT,
  AUTH_THROTTLE_WINDOW_MS,
} from './auth.constants.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          algorithm: ACCESS_TOKEN_ALGORITHM,
          expiresIn: config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS'),
        },
      }),
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ThrottlerModule.forRoot([
      { ttl: AUTH_THROTTLE_WINDOW_MS, limit: AUTH_GLOBAL_RATE_LIMIT },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AccessTokenService,
    AuthCookiesService,
    AuthService,
    EmailVerificationService,
    JwtAuthGuard,
    JwtStrategy,
    PasswordService,
    TrustedOriginGuard,
  ],
  exports: [
    AccessTokenService,
    AuthCookiesService,
    AuthService,
    JwtAuthGuard,
    JwtModule,
    PassportModule,
    PasswordService,
  ],
})
export class AuthModule {}
