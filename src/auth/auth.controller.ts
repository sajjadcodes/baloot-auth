import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Roles } from './decorators/roles.decorator.js';
import { AuthCookiesService } from './auth-cookies.service.js';
import { AuthService, type AdminUserInfo } from './auth.service.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { AdminClientGuard } from './guards/admin-client.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { TrustedOriginGuard } from './guards/trusted-origin.guard.js';
import type { AuthenticatedUser } from './strategies/jwt.strategy.js';
import {
  AUTH_THROTTLE_WINDOW_MS,
  CLIENT_ID_HEADER,
  EMAIL_VERIFICATION_RATE_LIMIT,
  PASSWORD_RESET_RATE_LIMIT,
  PASSWORD_RESET_REQUEST_RATE_LIMIT,
  LOGIN_RATE_LIMIT,
  LOGOUT_RATE_LIMIT,
  REFRESH_RATE_LIMIT,
  REFRESH_TOKEN_COOKIE,
  REGISTER_RATE_LIMIT,
  RESEND_VERIFICATION_RATE_LIMIT,
} from './auth.constants.js';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookiesService,
  ) {}

  @Get('me')
  @UseGuards(ThrottlerGuard, TrustedOriginGuard, JwtAuthGuard, RolesGuard)
  @Roles('user', 'platform_admin')
  @ApiOperation({
    summary: 'Get the current user',
    description:
      'Returns the authenticated user’s public information. The browser sends the access-token HttpOnly cookie automatically after login. API clients may also use an Authorization header.',
  })
  @ApiHeader({
    name: CLIENT_ID_HEADER,
    description: 'Public ID of the registered application client.',
    required: true,
  })
  async getCurrentUser(
    @Req() request: Request & { user: AuthenticatedUser },
    @Headers(CLIENT_ID_HEADER) clientId: string,
  ): Promise<{ id: string; email: string }> {
    if (request.user.clientId !== clientId) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    return this.auth.getCurrentUser(request.user.userId, clientId);
  }

  @Get('admin/users/:userId')
  @UseGuards(
    ThrottlerGuard,
    TrustedOriginGuard,
    JwtAuthGuard,
    AdminClientGuard,
    RolesGuard,
  )
  @Roles('platform_admin')
  @ApiOperation({
    summary: 'Get a user account for administration',
    description:
      'Returns account status, verification time, creation time, and assigned global roles for a user belonging to the authenticated admin’s client.',
  })
  @ApiHeader({
    name: CLIENT_ID_HEADER,
    description: 'Public ID of the registered application client.',
    required: true,
  })
  @ApiParam({
    name: 'userId',
    description: 'UUID of a user belonging to the authenticated client.',
    format: 'uuid',
  })
  async getAdminUser(
    @Headers(CLIENT_ID_HEADER) clientId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<AdminUserInfo> {
    return this.auth.getClientUserForAdmin(userId, clientId);
  }

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
      'Creates an unverified user and sends a verification email. Authentication cookies are set only after the user verifies their email and logs in.',
  })
  @ApiHeader({
    name: CLIENT_ID_HEADER,
    description: 'Public ID of the registered application client.',
    required: true,
  })
  async register(
    @Body() dto: RegisterDto,
    @Headers(CLIENT_ID_HEADER) clientId: string,
  ): Promise<{ id: string; email: string }> {
    return this.auth.register(dto.email, dto.password, clientId);
  }

  @Post('verify-email')
  @UseGuards(ThrottlerGuard, TrustedOriginGuard)
  @Throttle({
    default: {
      limit: EMAIL_VERIFICATION_RATE_LIMIT,
      ttl: AUTH_THROTTLE_WINDOW_MS,
    },
  })
  @ApiOperation({
    summary: 'Verify an email address',
    description:
      'Verifies the email using the short-lived token sent by email. Successful verification enables login.',
  })
  @ApiHeader({
    name: CLIENT_ID_HEADER,
    description: 'Public ID of the registered application client.',
    required: true,
  })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Headers(CLIENT_ID_HEADER) clientId: string,
  ): Promise<{ verified: true }> {
    await this.auth.verifyEmail(dto.token, clientId);
    return { verified: true };
  }

  @Post('resend-verification')
  @UseGuards(ThrottlerGuard, TrustedOriginGuard)
  @Throttle({
    default: {
      limit: RESEND_VERIFICATION_RATE_LIMIT,
      ttl: AUTH_THROTTLE_WINDOW_MS,
    },
  })
  @ApiOperation({
    summary: 'Resend email verification',
    description:
      'Sends another verification message when the account exists and is not already verified. The response does not reveal account existence.',
  })
  @ApiHeader({
    name: CLIENT_ID_HEADER,
    description: 'Public ID of the registered application client.',
    required: true,
  })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
    @Headers(CLIENT_ID_HEADER) clientId: string,
  ): Promise<{ message: string }> {
    await this.auth.resendVerificationEmail(dto.email, clientId);
    return {
      message: 'If the account is eligible, a verification email was sent.',
    };
  }

  @Post('forgot-password')
  @UseGuards(ThrottlerGuard, TrustedOriginGuard)
  @Throttle({
    default: {
      limit: PASSWORD_RESET_REQUEST_RATE_LIMIT,
      ttl: AUTH_THROTTLE_WINDOW_MS,
    },
  })
  @ApiOperation({
    summary: 'Request a password reset',
    description:
      'Sends a short-lived password-reset link when the account exists and is eligible. The response does not reveal account existence.',
  })
  @ApiHeader({
    name: CLIENT_ID_HEADER,
    description: 'Public ID of the registered application client.',
    required: true,
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Headers(CLIENT_ID_HEADER) clientId: string,
  ): Promise<{ message: string }> {
    await this.auth.requestPasswordReset(dto.email, clientId);
    return {
      message: 'If the account is eligible, a password reset email was sent.',
    };
  }

  @Post('reset-password')
  @UseGuards(ThrottlerGuard, TrustedOriginGuard)
  @Throttle({
    default: {
      limit: PASSWORD_RESET_RATE_LIMIT,
      ttl: AUTH_THROTTLE_WINDOW_MS,
    },
  })
  @ApiOperation({
    summary: 'Reset a password',
    description:
      'Uses a short-lived, single-use email token to set a new password and revoke all active refresh sessions.',
  })
  @ApiHeader({
    name: CLIENT_ID_HEADER,
    description: 'Public ID of the registered application client.',
    required: true,
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Headers(CLIENT_ID_HEADER) clientId: string,
  ): Promise<{ message: string }> {
    await this.auth.resetPassword(dto.token, dto.password, clientId);
    return { message: 'Password reset successfully.' };
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
