import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthCookiesService } from './auth-cookies.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { TrustedOriginGuard } from './guards/trusted-origin.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookiesService,
  ) {}

  @Post('register')
  @UseGuards(ThrottlerGuard, TrustedOriginGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Register a user',
    description:
      'Creates a user with the default role and sets access and refresh HttpOnly cookies. Tokens are not returned in the response body.',
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ id: string; email: string }> {
    const result = await this.auth.register(dto.email, dto.password);
    this.cookies.setAuthenticationCookies(
      response,
      result.accessToken,
      result.refreshToken,
    );
    return result.user;
  }
}
