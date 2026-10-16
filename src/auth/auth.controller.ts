import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthCookiesService } from './auth-cookies.service.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { TrustedOriginGuard } from './guards/trusted-origin.guard.js';
import {
  AUTH_THROTTLE_WINDOW_MS,
  CLIENT_ID_HEADER,
  LOGIN_RATE_LIMIT,
  LOGOUT_RATE_LIMIT,
  REFRESH_RATE_LIMIT,
  REFRESH_TOKEN_COOKIE,
  REGISTER_RATE_LIMIT,
} from './auth.constants.js';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookiesService,
  ) {}

  @Post('register')
  @UseGuards(ThrottlerGuard, TrustedOriginGuard)
  @Throttle({
    default: {
      limit: REGISTER_RATE_LIMIT,
      ttl: AUTH_THROTTLE_WINDOW_MS,
    },
  })
  @ApiOperation({
    summary: 'Register a user',
    description:
      'Creates a user with the default role and sets access and refresh HttpOnly cookies. Tokens are not returned in the response body.',
  })
  @ApiHeader({
    name: CLIENT_ID_HEADER,
    description: 'Public ID of the registered application client.',
    required: true,
  })
  async register(
    @Body() dto: RegisterDto,
    @Headers(CLIENT_ID_HEADER) clientId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ id: string; email: string }> {
    const result = await this.auth.register(dto.email, dto.password, clientId);
    this.cookies.setAuthenticationCookies(
      response,
      result.accessToken,
      result.refreshToken,
    );
    return result.user;
  }

  @Post('login')
  @UseGuards(ThrottlerGuard, TrustedOriginGuard)
  @Throttle({
    default: {
      limit: LOGIN_RATE_LIMIT,
      ttl: AUTH_THROTTLE_WINDOW_MS,
    },
  })
  @ApiOperation({
    summary: 'Log in a user',
    description:
      'Authenticates a user and sets access and refresh HttpOnly cookies. Tokens are not returned in the response body.',
  })
  @ApiHeader({
    name: CLIENT_ID_HEADER,
    description: 'Public ID of the registered application client.',
    required: true,
  })
  async login(
    @Body() dto: LoginDto,
    @Headers(CLIENT_ID_HEADER) clientId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ id: string; email: string }> {
    const result = await this.auth.login(dto.email, dto.password, clientId);
    this.cookies.setAuthenticationCookies(
      response,
      result.accessToken,
      result.refreshToken,
    );
    return result.user;
  }

  @Post('refresh')
  @UseGuards(ThrottlerGuard, TrustedOriginGuard)
  @Throttle({
    default: {
      limit: REFRESH_RATE_LIMIT,
      ttl: AUTH_THROTTLE_WINDOW_MS,
    },
  })
  @ApiOperation({
    summary: 'Refresh authentication tokens',
    description:
      'Rotates the refresh token from the HttpOnly cookie and sets new access and refresh cookies. Tokens are not returned in the response body. Reuse of a revoked token revokes the user’s active refresh sessions.',
  })
  @ApiHeader({
    name: CLIENT_ID_HEADER,
    description: 'Public ID of the registered application client.',
    required: true,
  })
  async refresh(
    @Req() request: Request,
    @Headers(CLIENT_ID_HEADER) clientId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ id: string; email: string }> {
    const refreshToken: unknown = request.cookies?.[
      REFRESH_TOKEN_COOKIE
    ] as unknown;
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const result = await this.auth.refresh(refreshToken, clientId);
    this.cookies.setAuthenticationCookies(
      response,
      result.accessToken,
      result.refreshToken,
    );
    return result.user;
  }

  @Post('logout')
  @UseGuards(ThrottlerGuard, TrustedOriginGuard)
  @Throttle({
    default: {
      limit: LOGOUT_RATE_LIMIT,
      ttl: AUTH_THROTTLE_WINDOW_MS,
    },
  })
  @ApiOperation({
    summary: 'Log out a user',
    description:
      'Revokes the refresh session from the HttpOnly cookie when valid for this client, then clears the access and refresh cookies. Any issued access token remains valid until it expires.',
  })
  @ApiHeader({
    name: CLIENT_ID_HEADER,
    description: 'Public ID of the registered application client.',
    required: true,
  })
  async logout(
    @Req() request: Request,
    @Headers(CLIENT_ID_HEADER) clientId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const refreshToken: unknown = request.cookies?.[
      REFRESH_TOKEN_COOKIE
    ] as unknown;

    await this.auth.logout(
      typeof refreshToken === 'string' ? refreshToken : undefined,
      clientId,
    );
    this.cookies.clearAuthenticationCookies(response);
  }
}
