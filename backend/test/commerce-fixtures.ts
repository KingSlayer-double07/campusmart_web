import {
  ListingCategory,
  ListingStatus,
  ProductCondition,
  UserRole,
  VerificationStatus,
} from '../src/generated/prisma/enums';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createUser } from './utils';

// Rows for the cart and checkout suites, written straight through Prisma (Phase 3's API paths
// are covered by their own suites).

let schools = 0;
export async function createSchool(prisma: PrismaService, isActive = true) {
  schools += 1;
  return prisma.institution.create({
    data: {
      name: `School ${schools}`,
      domains: [`school${schools}.edu.ng`],
      isActive,
    },
  });
}

export async function createSeller(
  prisma: PrismaService,
  institutionId: string,
  storeName = 'Ada Wears',
) {
  const seller = await createUser(prisma, {
    role: UserRole.SELLER,
    institutionId,
    verificationStatus: VerificationStatus.VERIFIED,
  });
  await prisma.sellerProfile.create({ data: { userId: seller.id, storeName } });
  return seller;
}

export async function createListing(
  prisma: PrismaService,
  seller: { id: string; institutionId: string | null },
  options: {
    title?: string;
    priceKobo?: number;
    stock?: number;
    status?: ListingStatus;
    variants?: { label: string; stock: number; priceKobo?: number }[];
  } = {},
) {
  const variants = options.variants ?? [];
  const stock = variants.length
    ? variants.reduce((sum, v) => sum + v.stock, 0)
    : (options.stock ?? 5);
  return prisma.listing.create({
    data: {
      title: options.title ?? 'Desk lamp',
      description: '',
      priceKobo: options.priceKobo ?? 450_000,
      stock,
      status: options.status ?? ListingStatus.ACTIVE,
      category: ListingCategory.TECH,
      condition: ProductCondition.USED_GOOD,
      sellerId: seller.id,
      institutionId: seller.institutionId!,
      images: {
        create: [
          {
            url: `https://res.cloudinary.com/campusmart-test/image/upload/v1/campusmart/listings/${seller.id}/lamp.jpg`,
            publicId: `campusmart/listings/${seller.id}/lamp`,
            position: 0,
          },
        ],
      },
      variants: {
        create: variants.map((v) => ({
          label: v.label,
          stock: v.stock,
          priceKobo: v.priceKobo ?? null,
        })),
      },
    },
    include: { variants: true },
  });
}

export async function createStation(
  prisma: PrismaService,
  institutionId: string,
  isActive = true,
) {
  return prisma.pickupStation.create({
    data: {
      institutionId,
      name: 'Library Pickup Point',
      address: 'Main library, ground floor',
      contactName: 'Mr Bello',
      contactPhone: '+234 801 234 5678',
      openingHours: [{ day: 'MON', open: '09:00', close: '17:00' }],
      isActive,
    },
  });
}
