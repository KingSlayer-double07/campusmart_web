import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { hash, compare } from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { safeUserSelect } from './user.select';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      select: safeUserSelect,
    });
  }

  // Needs the current password; on success every other session is signed out (guide 0.4, 1.4 rule 11)
  async changePassword(
    userId: string,
    currentSessionId: string,
    dto: ChangePasswordDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.password) {
      throw new ConflictException('Password not set');
    }

    const isMatch = await compare(dto.currentPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'New password cannot be the same as the current password',
      );
    }

    const newHashedPassword = await hash(dto.newPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { password: newHashedPassword },
      });
      await this.sessions.revokeOthers(userId, currentSessionId, tx);
    });
  }

  // Another user's public card: never the email
  async getPublicProfile(userId: string) {
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
