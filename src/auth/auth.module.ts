import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthCookiesService } from './auth-cookies.service';
import { AccessTokenService } from './access-token.service';
import { AuthService } from './auth.service';
import { TrustedOriginGuard } from './guards/trusted-origin.guard';
import { PasswordService } from './password.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import {
  ACCESS_TOKEN_ALGORITHM,
  AUTH_GLOBAL_RATE_LIMIT,
  AUTH_THROTTLE_WINDOW_MS,
} from './auth.constants';

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
    JwtStrategy,
    PasswordService,
    TrustedOriginGuard,
  ],
  exports: [
    AccessTokenService,
    AuthCookiesService,
    AuthService,
    JwtModule,
    PassportModule,
    PasswordService,
  ],
})
export class AuthModule {}
