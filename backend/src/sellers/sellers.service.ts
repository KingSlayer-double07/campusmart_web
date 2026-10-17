import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { deliveryDetailsSelect, hasDeliveryDetails } from './seller-delivery';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { isOwnUploadUrl, uploadFolder } from '../uploads/cloudinary-urls';
import type {
  SellerProfileDto,
  UpdateSellerProfileDto,
} from './dto/seller-profile.dto';

const profileSelect = {
  storeName: true,
  bio: true,
  logoUrl: true,
  isOnline: true,
  ratingAvg: true,
  ratingCount: true,
  payoutBankName: true,
  payoutAccountLast4: true,
  payoutAccountName: true,
  paystackRecipientCode: true,
  ...deliveryDetailsSelect,
} satisfies Prisma.SellerProfileSelect;

type ProfileRow = Prisma.SellerProfileGetPayload<{
  select: typeof profileSelect;
}>;

const toDto = ({
  paystackRecipientCode,
  ...profile
}: ProfileRow): SellerProfileDto => ({
  ...profile,
  hasPayoutAccount: !!paystackRecipientCode,
  deliveryDetailsComplete: hasDeliveryDetails(profile),
});

@Injectable()
export class SellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // Sellers who existed before Phase 2 (or were made sellers later) get an empty profile here
  async me(userId: string): Promise<SellerProfileDto> {
    const profile = await this.prisma.sellerProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
      select: profileSelect,
    });
    return toDto(profile);
  }

  async update(
    userId: string,
    dto: UpdateSellerProfileDto,
  ): Promise<SellerProfileDto> {
    if (dto.logoUrl) {
      const { cloudName } = this.cloudinary.requireSettings();
      if (
        !isOwnUploadUrl(dto.logoUrl, cloudName, uploadFolder('AVATAR', userId))
      ) {
        throw new BadRequestException({
          code: 'INVALID_IMAGE',
          message:
            "That logo wasn't uploaded through CampusMart. Please upload it again.",
        });
      }
    }
    const data = {
      storeName: dto.storeName,
      bio: dto.bio,
      logoUrl: dto.logoUrl,
      isOnline: dto.isOnline,
      pickupArea: dto.pickupArea,
      pickupAddress: dto.pickupAddress,
      contactPhone: dto.contactPhone,
      allowsPickup: dto.allowsPickup,
    };
    if (dto.allowsPickup) {
      // Buyers who pick up go to the address, so it has to be there first (decision DL1)
      const current = await this.prisma.sellerProfile.findUnique({
        where: { userId },
        select: deliveryDetailsSelect,
      });
      const next = {
        pickupArea: dto.pickupArea ?? current?.pickupArea ?? null,
        pickupAddress: dto.pickupAddress ?? current?.pickupAddress ?? null,
        contactPhone: dto.contactPhone ?? current?.contactPhone ?? null,
      };
      if (!hasDeliveryDetails(next)) {
        throw new BadRequestException({
          code: 'PICKUP_DETAILS_REQUIRED',
          message:
            'Add your area, address and phone number before letting buyers pick up from you',
        });
      }
    }
    const profile = await this.prisma.sellerProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
      select: profileSelect,
    });
    return toDto(profile);
  }
}
