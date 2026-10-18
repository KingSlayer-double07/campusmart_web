import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
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
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { toUserDto, UserDto } from '../users/dto/user.dto';
import { AccountService } from './account.service';
import {
  SchoolEmailCodeDto,
  SchoolEmailDto,
  SetInstitutionDto,
} from './dto/account.dto';

const STRICT = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('Users')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @ApiOperation({
    summary: 'Choose or change your school (buyers)',
    description:
      'After signing up with any email (T1), and later from the profile (G1). Changing school empties the cart.',
  })
  @ApiOkEnvelope(UserDto)
  @ApiResponse({
    status: 403,
    type: ErrorResponseDto,
    description: 'Not a buyer, or INSTITUTION_INACTIVE',
  })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @Patch('institution')
  async setInstitution(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetInstitutionDto,
  ): Promise<UserDto> {
    return toUserDto(
      await this.account.setInstitution(user, dto.institutionId),
    );
  }

  @ApiOperation({
    summary: 'Send a code to a school email, to start selling (G2)',
    description:
      'Buyers whose account email is not a school email. The code lasts 10 minutes.',
  })
  @ApiNoContentResponse({ description: 'Code sent' })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'ALREADY_VERIFIED or VALIDATION_FAILED',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'EMAIL_TAKEN',
  })
  @ApiResponse({
    status: 422,
    type: ErrorResponseDto,
    description: 'INSTITUTION_NOT_SUPPORTED',
  })
  @ApiResponse({
    status: 429,
    type: ErrorResponseDto,
    description: 'RATE_LIMITED',
  })
  @RequireVerifiedEmail()
  @Throttle(STRICT)
  @Post('school-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendSchoolEmailCode(
    @CurrentUser() user: AuthUser,
    @Body() dto: SchoolEmailDto,
  ): Promise<void> {
    await this.account.sendSchoolEmailCode(user, dto.email);
  }

  @ApiOperation({
    summary: 'Confirm the school email and become a seller (G2)',
    description:
      'The account becomes a SELLER at that school with an empty store; it still needs ID verification to publish.',
  })
  @ApiOkEnvelope(UserDto)
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'INVALID_CODE, CODE_EXPIRED or CODE_LOCKED',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'EMAIL_TAKEN',
  })
  @RequireVerifiedEmail()
  @Throttle(STRICT)
  @Post('school-email/verify')
  @HttpCode(HttpStatus.OK)
  async verifySchoolEmail(
    @CurrentUser() user: AuthUser,
    @Body() dto: SchoolEmailCodeDto,
  ): Promise<UserDto> {
    return toUserDto(await this.account.verifySchoolEmail(user, dto.code));
  }

  @ApiOperation({
    summary: 'Become a seller with the confirmed school email (G2)',
    description:
      'For a buyer whose account email is a school email, or who confirmed one before.',
  })
  @ApiOkEnvelope(UserDto)
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'SCHOOL_EMAIL_REQUIRED',
  })
  @RequireVerifiedEmail()
  @Post('become-seller')
  @HttpCode(HttpStatus.OK)
  async becomeSeller(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return toUserDto(await this.account.becomeSeller(user));
  }
}
