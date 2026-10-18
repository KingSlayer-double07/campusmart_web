import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import type { Env } from '../config/env';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { InviteInfoDto } from '../riders/dto/rider.dto';
import { toUserDto, UserDto } from '../users/dto/user.dto';
import {
  clearAuthCookies,
  REFRESH_COOKIE,
  setAuthCookies,
} from './auth-cookies';
import type { AuthUser, ClientMeta } from './auth-user';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { AuthProvidersDto } from './dto/auth-providers.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { safeNext } from './google/safe-next';
import {
  GoogleOAuthService,
  GoogleSignInError,
} from './google/google-oauth.service';
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

// The state and PKCE verifier of one Google sign-in, kept for 10 minutes on the callback's path only
const GOOGLE_COOKIE = 'google_oauth';
const googleCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/api/auth/google',
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleOAuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @ApiOperation({
    summary: 'Which sign-in methods are set up',
    description: 'Public.',
  })
  @ApiOkEnvelope(AuthProvidersDto)
  @Get('providers')
  providers(): AuthProvidersDto {
    return { google: this.google.configured };
  }

  @ApiOperation({
    summary: 'Start Google sign-in (buyers, T1 and G3)',
    description:
      'Redirects to Google. Google sends the user back to /auth/google/callback, which signs them in and ' +
      'redirects to the app. `next` is where to go afterwards (an app path).',
  })
  @ApiResponse({ status: 302, description: 'To Google' })
  @ApiResponse({
    status: 503,
    type: ErrorResponseDto,
    description: 'GOOGLE_NOT_CONFIGURED',
  })
  @Get('google')
  googleStart(
    @Query('next') next: string | undefined,
    @Res() res: Response,
  ): void {
    if (!this.google.configured) {
      throw new ServiceUnavailableException({
        code: 'GOOGLE_NOT_CONFIGURED',
        message: "Google sign-in isn't set up yet",
      });
    }
    const { url, state, verifier } = this.google.start();
    res.cookie(
      GOOGLE_COOKIE,
      JSON.stringify({ state, verifier, next: safeNext(next) }),
      { ...googleCookieOptions, maxAge: 10 * 60 * 1000 },
    );
    res.redirect(302, url);
  }

  @ApiOperation({
    summary: 'Google sends the user back here',
    description:
      'Checks the state, signs the buyer in (setting both cookies) and redirects to /onboarding/google. ' +
      'On failure, redirects to the buyer sign-in page with `error` set to a code.',
  })
  @ApiResponse({ status: 302, description: 'To the app' })
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const appUrl = this.config.get('APP_URL', { infer: true });
    const saved = parseGoogleCookie(
      (req.cookies as Record<string, unknown> | undefined)?.[GOOGLE_COOKIE],
    );
    res.clearCookie(GOOGLE_COOKIE, googleCookieOptions);
    const fail = (reason: string) =>
      res.redirect(
        302,
        `${appUrl}/onboarding/buyers/sign-in?error=${encodeURIComponent(reason)}`,
      );

    if (
      !this.google.configured ||
      !code ||
      !state ||
      !saved ||
      saved.state !== state
    ) {
      return fail('GOOGLE_FAILED');
    }
    try {
      const profile = await this.google.profile(code, saved.verifier);
      const { tokens } = await this.auth.googleSignIn(profile, clientMeta(req));
      setAuthCookies(res, tokens);
      const next = saved.next ? `?next=${encodeURIComponent(saved.next)}` : '';
      res.redirect(302, `${appUrl}/onboarding/google${next}`);
    } catch (error) {
      if (error instanceof GoogleSignInError) return fail('GOOGLE_FAILED');
      if (error instanceof HttpException) {
        const body = error.getResponse() as { code?: string };
        return fail(body.code ?? 'GOOGLE_FAILED');
      }
      throw error;
    }
  }

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
    summary: "A rider's invitation",
    description:
      'Decision DX1: who the invite link is for, so the page can greet them. 404 INVALID_INVITE once used or expired.',
  })
  @ApiParam({ name: 'token' })
  @ApiOkEnvelope(InviteInfoDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @Get('invites/:token')
  inviteInfo(@Param('token') token: string): Promise<InviteInfoDto> {
    return this.auth.inviteInfo(token);
  }

  @ApiOperation({
    summary: 'Accept a rider invitation',
    description:
      'Sets the password from the invite link, confirms the email and signs the rider in (sets the auth cookies).',
  })
  @ApiOkEnvelope(UserDto)
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'INVALID_INVITE or VALIDATION_FAILED',
  })
  @ApiResponse({
    status: 403,
    type: ErrorResponseDto,
    description: INACTIVE_DOC,
  })
  @Throttle(STRICT)
  @Post('accept-invite')
  @HttpCode(HttpStatus.OK)
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    const { user, tokens } = await this.auth.acceptInvite(dto, clientMeta(req));
    setAuthCookies(res, tokens);
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

function parseGoogleCookie(
  raw: unknown,
): { state: string; verifier: string; next: string | null } | null {
  if (typeof raw !== 'string') return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return typeof value.state === 'string' && typeof value.verifier === 'string'
      ? {
          state: value.state,
          verifier: value.verifier,
          next: typeof value.next === 'string' ? value.next : null,
        }
      : null;
  } catch {
    return null;
  }
}
