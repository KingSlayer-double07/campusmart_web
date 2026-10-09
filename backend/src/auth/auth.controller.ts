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
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { toUserDto, UserDto } from '../users/dto/user.dto';
import {
  clearAuthCookies,
  REFRESH_COOKIE,
  setAuthCookies,
} from './auth-cookies';
import type { AuthUser, ClientMeta } from './auth-user';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// Login, register and every code/password route: 5 a minute per client IP (guide 0.5)
const STRICT = { default: { limit: 5, ttl: 60_000 } };

const clientMeta = (req: Request): ClientMeta => ({
  userAgent: req.get('user-agent'),
  ipAddress: req.ip,
});

const INACTIVE_DOC =
  "INSTITUTION_INACTIVE: the user's institution is switched off. Only admins can sign in there.";

const refreshCookie = (req: Request): unknown =>
  (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiOperation({
    summary: 'Create an account with a school email',
    description:
      'The institution comes from the email domain (or a parent of it). Sets both auth cookies and ' +
      'emails a 6-digit verification code.',
  })
  @ApiOkEnvelope(UserDto, { status: 201 })
  @ApiResponse({
    status: 422,
    type: ErrorResponseDto,
    description:
      'INSTITUTION_NOT_SUPPORTED: the email domain belongs to no school',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'Email already registered',
  })
  @Throttle(STRICT)
  @ApiResponse({
    status: 403,
    type: ErrorResponseDto,
    description: INACTIVE_DOC,
  })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    const { user, tokens } = await this.auth.register(dto, clientMeta(req));
    setAuthCookies(res, tokens);
    return toUserDto(user);
  }

  @ApiOperation({ summary: 'Verify the email with the 6-digit code' })
  @ApiCookieAuth()
  @ApiOkEnvelope(UserDto)
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description:
      'INVALID_CODE (details.attemptsLeft), CODE_LOCKED after 5 wrong codes, CODE_EXPIRED',
  })
  @UseGuards(JwtAuthGuard)
  @Throttle(STRICT)
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyEmailDto,
  ): Promise<UserDto> {
    return toUserDto(await this.auth.verifyEmail(user, dto.code));
  }

  @ApiOperation({
    summary: 'Email a new verification code',
    description: 'Invalidates earlier codes. At most 1 a minute and 5 an hour.',
  })
  @ApiCookieAuth()
  @ApiNoContentResponse()
  @ApiResponse({
    status: 429,
    type: ErrorResponseDto,
    description: 'RATE_LIMITED (details.retryAfterSeconds)',
  })
  @UseGuards(JwtAuthGuard)
  @Throttle(STRICT)
  @Post('verify-email/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendVerification(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.resendVerification(user);
  }

  @ApiOperation({ summary: 'Sign in', description: 'Sets both auth cookies.' })
  @ApiOkEnvelope(UserDto)
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({
    status: 403,
    type: ErrorResponseDto,
    description: INACTIVE_DOC,
  })
  @Throttle(STRICT)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    const { user, tokens } = await this.auth.login(dto, clientMeta(req));
    setAuthCookies(res, tokens);
    return toUserDto(user);
  }

  @ApiOperation({
    summary: 'Rotate the session',
    description:
      'Uses the refresh_token cookie (path /api/auth). Issues a new access token and a new refresh token. ' +
      'Presenting an already-rotated refresh token revokes the session.',
  })
  @ApiNoContentResponse({ description: 'Both cookies rotated' })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({
    status: 403,
    type: ErrorResponseDto,
    description: INACTIVE_DOC,
  })
  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    try {
      setAuthCookies(
        res,
        await this.auth.refresh(refreshCookie(req), clientMeta(req)),
      );
    } catch (error) {
      clearAuthCookies(res);
      throw error;
    }
  }

  @ApiOperation({
    summary: 'Sign out this device',
    description: 'Revokes the session and clears both cookies.',
  })
  @ApiNoContentResponse()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(refreshCookie(req));
    clearAuthCookies(res);
  }

  @ApiOperation({ summary: 'The signed-in user' })
  @ApiCookieAuth()
  @ApiOkEnvelope(UserDto)
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser): UserDto {
    return toUserDto(user);
  }

  @ApiOperation({
    summary: 'Email a password reset code',
    description: 'Always 204, so accounts cannot be probed.',
  })
  @ApiNoContentResponse()
  @Throttle(STRICT)
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(dto.email);
  }

  @ApiOperation({
    summary: 'Set a new password with the emailed code',
    description: 'Revokes every session of the account.',
  })
  @ApiNoContentResponse()
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'INVALID_CODE',
  })
  @Throttle(STRICT)
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto);
  }
}
