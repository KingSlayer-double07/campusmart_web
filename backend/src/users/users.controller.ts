import { Controller, Get, UseGuards, Patch, Post, Param, Logger, Body, ParseUUIDPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse, ApiBody, ApiParam } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { User } from "../generated/prisma/client";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { SubmitVerificationDto } from "./dto/submit-verification.dto";

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
    constructor(
        private readonly usersService: UsersService,
    ) {}

    private readonly logger = new Logger(UsersController.name);

    @ApiOperation({
        summary: 'Return full profile of the currently authenticated user',
    })
    @ApiResponse({
        status: 200,
        description: 'Return full profile of the currently authenticated user',
    })
    @UseGuards(JwtAuthGuard)
    @Get('me/profile')
    async getMyProfile(@CurrentUser() user:User) {
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
    async updateMyProfile(@CurrentUser() user:User, @Body() dto: UpdateProfileDto) {
        const updatedUser = await this.usersService.updateProfile(user.id, dto);
        return updatedUser;
    }

    @ApiOperation({
        summary: 'Change password of the currently authenticated user',
    })
    @ApiBody({ type: ChangePasswordDto})
    @ApiResponse({
        status: 200,
        description: 'Password changed successfully',
    })
    @UseGuards(JwtAuthGuard)
    @Patch('me/password')
    async changeMyPassword(@CurrentUser() user:User, @Body() dto: ChangePasswordDto) {
        const result = await this.usersService.changePassword(user.id, dto);
        return result;
    }

    @ApiOperation({
        summary: 'Submit verification documents for the currently authenticated user',
    })
    @ApiBody({ type: SubmitVerificationDto})
    @ApiResponse({
        status: 200,
        description: 'Verification documents submitted successfully',
    })
    @UseGuards(JwtAuthGuard)
    @Post('me/verify')
    async submitVerification(@CurrentUser() user:User, @Body() dto: SubmitVerificationDto) {
        const result = await this.usersService.submitVerification(user.id, dto);
        return result;
    }

    @ApiOperation({
        summary: 'Get public profile of a user by their ID',
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
    @Get(':id')
    async getPublicProfile(@Param('id', new ParseUUIDPipe()) id: string) {
        this.logger.log(`Fetching public profile for user: ${id}`);
        const profile = await this.usersService.getPublicProfile(id);
        return profile;
    }
}