import {
  Controller,
  Get,
  UseGuards,
  Patch,
  Post,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../generated/prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SubmitVerificationDto } from './dto/submit-verification.dto';

@ApiTags('Users')
@ApiCookieAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({
    summary: 'Return full profile of the currently authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Return full profile of the currently authenticated user',
  })
  @UseGuards(JwtAuthGuard)
  @Get('me/profile')
  getMyProfile(@CurrentUser() user: User) {
    return user;
  }

  @ApiOperation({
    summary: 'Update profile of the currently authenticated user',
  })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({
    status: 200,
    description: 'Return updated profile of the currently authenticated user',
  })
  @UseGuards(JwtAuthGuard)
  @Patch('me/profile')
  async updateMyProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @ApiOperation({
    summary: 'Change password of the currently authenticated user',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Patch('me/password')
  async changeMyPassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user.id, dto);
  }

  @ApiOperation({
    summary:
      'Submit verification documents for the currently authenticated user',
  })
  @ApiBody({ type: SubmitVerificationDto })
  @ApiResponse({
    status: 200,
    description: 'Verification documents submitted successfully',
  })
  @UseGuards(JwtAuthGuard)
  @Post('me/verify')
  async submitVerification(
    @CurrentUser() user: User,
    @Body() dto: SubmitVerificationDto,
  ) {
    return this.usersService.submitVerification(user.id, dto);
  }

  @ApiOperation({
    summary: 'Get public profile of a user by their ID',
    description:
      'Name, role, verification status, trust score, institution and join date. Never the email.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the user whose public profile is being requested',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Return public profile of the specified user',
  })
  @ApiResponse({ status: 400, description: 'The id is not a UUID' })
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getPublicProfile(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.getPublicProfile(id);
  }
}
