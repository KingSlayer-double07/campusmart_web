import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginDto } from './dto/login.dto';
// TODO(resend): Uncomment with the verification endpoints below.
// import { VerifyEmailDto } from './dto/verify-email.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiOperation, ApiTags, ApiBody, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from '../generated/prisma/client';

// 7 days in milliseconds
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: COOKIE_MAX_AGE,
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── POST /auth/register ─────────────────────────────────────────────

  @ApiOperation({
    summary: 'Register a new account',
    description: 'Creates a new user and returns the user data along with an authentication token',
  })
  @ApiBody({ type:RegisterUserDto })
  @ApiResponse({
    status: 201,
    description: 'Account created successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        user: { type: 'object' },
      },
    },
  })
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 registration attempts per minute
  @HttpCode(HttpStatus.CREATED)
  async registeruser(
    @Body() dto: RegisterUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.authService.registerUser(dto);
    res.cookie('access_token', token, COOKIE_OPTIONS);
    return { message: 'Account created successfully', user };
  }

  // ── POST /auth/login ──────────────────────────────────────────────────────
  // LocalAuthGuard runs LocalStrategy first — if credentials are wrong,
  // it throws before the handler is ever called

  @ApiOperation({
    summary: 'Login to an existing account',
    description: 'Logs in with email and password, returning user data and setting an authentication cookie',
  })
  @ApiBody({ type:LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Logged in successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        user: { type: 'object' },
      },
    },
  })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 login attempts per minute
  @HttpCode(HttpStatus.OK)
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() _dto: LoginDto, // validated but LocalStrategy does the actual check
  ) {
    const { user, token } = await this.authService.login(req.user);
    res.cookie('access_token', token, COOKIE_OPTIONS);
    return { message: 'Logged in successfully', user };
  }

  // ── POST /auth/logout ─────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Logout from the current account',
    description: 'Clears the authentication cookie, effectively logging the user out'
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @Post('logout')
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // 10 logout attempts per minute
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    return { message: 'Logged out successfully' };
  }

  // ── POST /auth/verify-email ───────────────────────────────────────────────
  // TODO(resend): Disabled until Resend is set up — see src/mail/mail.service.ts.

  // @ApiOperation({
  //   summary: 'Verify email address',
  //   description: 'Confirms the current user\'s email using the 6-digit code sent to them',
  // })
  // @ApiBody({ type: VerifyEmailDto })
  // @ApiResponse({ status: 200, description: 'Email verified successfully' })
  // @UseGuards(JwtAuthGuard)
  // @Post('verify-email')
  // @Throttle({ default: { limit: 10, ttl: 60_000 } }) // 10 verification attempts per minute
  // @HttpCode(HttpStatus.OK)
  // async verifyEmail(@CurrentUser() user: User, @Body() dto: VerifyEmailDto) {
  //   await this.authService.verifyEmail(user.id, dto.code);
  //   return { message: 'Email verified successfully' };
  // }

  // ── POST /auth/verify-email/resend ────────────────────────────────────────

  // @ApiOperation({
  //   summary: 'Resend verification code',
  //   description: 'Sends a new verification code to the current user\'s email, invalidating earlier codes',
  // })
  // @ApiResponse({ status: 200, description: 'Verification code sent' })
  // @UseGuards(JwtAuthGuard)
  // @Post('verify-email/resend')
  // @Throttle({ default: { limit: 2, ttl: 60_000 } }) // 2 resends per minute
  // @HttpCode(HttpStatus.OK)
  // async resendVerification(@CurrentUser() user: User) {
  //   await this.authService.resendVerificationCode(user.id);
  //   return { message: 'Verification code sent' };
  // }

  
  // ── GET /auth/me ──────────────────────────────────────────────────────────
  @ApiOperation({
    summary: 'Get current user details',
    description: 'Retrieves the details of the currently authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Current user details retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', format: 'email' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        role: { type: 'string', enum: ['BUYER', 'SELLER', 'ADMIN'] },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: User) {
    return user;
  }
}