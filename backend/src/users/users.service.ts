import { Injectable, ConflictException, NotFoundException, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { hash, compare } from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SubmitVerificationDto } from './dto/submit-verification.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly logger = new Logger(UsersService.name);

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const hashedPassword = await hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        institutionId: dto.institutionId ?? null,
      },
      // Never return the password hash to callers
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        verificationStatus: true,
        trustScore: true,
        institutionId: true,
        createdAt: true,
      },
    });

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      // Include password here so AuthService can compare hashes
      select: {
        id: true,
        email: true,
        password: true,
        firstName: true,
        lastName: true,
        role: true,
        verificationStatus: true,
        trustScore: true,
        institutionId: true,
        createdAt: true,
        isSuspended: true,
        isActive: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        verificationStatus: true,
        trustScore: true,
        institutionId: true,
        createdAt: true,
        isSuspended: true,
        isActive: true,
      },
    });
  }

  // Update user profile (excluding password)
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        institutionId: dto.institutionId,
        email: dto.email,
      },
    });
  }

  // Change user password
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    // If user not found, throw an error (shouldn't happen if authenticated)
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // If password is not set, throw an error
    if (!user.password) {
      throw new ConflictException('Password not set');
    }

    // Compare current password with stored hash
    const isMatch = await compare(dto.currentPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // If the new password is the same as the current password, throw an error
    const isSamePassword = await compare(dto.newPassword, user.password);
    if (isSamePassword) {
      throw new BadRequestException('New password cannot be the same as the current password');
    }

    // Hash the new password and update the user record
    const newHashedPassword = await hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: newHashedPassword },
    });
    return { message: 'Password changed successfully' };    
  }

  // Submit verification documents for the user
  async submitVerification(userId: string, dto: SubmitVerificationDto) {
    // Check if user exists    
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.prisma.verificationRequest.create({
      data: {
        userId,
        documentUrl: dto.verificationData,
        status: 'PENDING',
      },
    });
  }

  // Display profile data
  async getPublicProfile(userId: string) {
    this.logger.log(`Searching for user with ID: ${userId}`);
    const publicProfile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        verificationStatus: true,
        trustScore: true,
        institutionId: true,
        createdAt: true,
      },
    });
    
    if (!publicProfile) {
      throw new NotFoundException('User not found');
    }
    return publicProfile;
  }
}