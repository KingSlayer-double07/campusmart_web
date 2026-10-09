import {
  Controller,
  Get,
  UseGuards,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PublicProfileDto } from './dto/public-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { toUserDto, UserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: "The signed-in user's own profile" })
  @ApiOkEnvelope(UserDto)
  @Get('me/profile')
  getMyProfile(@CurrentUser() user: AuthUser): UserDto {
    return toUserDto(user);
  }

  @ApiOperation({ summary: "Update the signed-in user's profile" })
  @ApiOkEnvelope(UserDto)
  @Patch('me/profile')
  async updateMyProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserDto> {
    return toUserDto(await this.usersService.updateProfile(user.id, dto));
  }

  @ApiOperation({
    summary: 'Change the password',
    description:
      'Needs the current password. Signs out every other session; this one stays signed in.',
  })
  @ApiNoContentResponse({ description: 'Password changed' })
  @ApiResponse({
    status: 401,
    type: ErrorResponseDto,
    description: 'Current password is incorrect',
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeMyPassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.usersService.changePassword(user.id, user.sessionId, dto);
  }

  @ApiOperation({
    summary: "Another user's public profile",
    description:
      'Name, role, verification status, trust score, institution and join date. Never the email.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(PublicProfileDto)
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'The id is not a UUID',
  })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @Get(':id')
  async getPublicProfile(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PublicProfileDto> {
    return this.usersService.getPublicProfile(id);
  }
}
