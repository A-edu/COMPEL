import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, type Me } from './auth.service.js';
import { RequestOtpDto } from './dto/request-otp.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { OtpService } from './otp.service.js';
import { Public } from './public.decorator.js';
import { SESSION_COOKIE, sessionCookieOptions } from './session-cookie.js';
import { CurrentUser, type SessionUser } from './session-user.js';
import { SessionService } from './session.service.js';

export const OTP_REQUESTED_MESSAGE =
  'If this email is registered, a code has been sent.';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(
    @Body() body: RequestOtpDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.otp.requestCode(body.email, req.ip);
    return { message: OTP_REQUESTED_MESSAGE };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(
    @Body() body: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    const userId = await this.otp.verifyCode(body.email, body.code, req.ip);
    const { token, expiresAt } = await this.sessions.create(userId);
    res.cookie(SESSION_COOKIE, token, {
      ...sessionCookieOptions(req),
      expires: expiresAt,
    });
    return this.auth.me(userId);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.logout(req.cookies[SESSION_COOKIE] as string, req.ip);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(req));
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser): Promise<Me> {
    return this.auth.me(user.userId);
  }
}
