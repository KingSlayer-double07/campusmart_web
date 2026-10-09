import type { Prisma } from '../generated/prisma/client';
import { VerificationStatus } from '../generated/prisma/enums';
import type { ListingCardDto, ListingDto } from './dto/listing.dto';
import {
  compareVariantLabels,
  priceRange,
  sellerDisplayName,
} from './listing-rules';

const sellerSelect = {
  id: true,
  username: true,
  firstName: true,
  verificationStatus: true,
  sellerProfile: {
    select: {
      storeName: true,
      logoUrl: true,
      ratingAvg: true,
      ratingCount: true,
      isOnline: true,
    },
  },
} satisfies Prisma.UserSelect;

export const cardSelect = {
  id: true,
  title: true,
  priceKobo: true,
  stock: true,
  status: true,
  category: true,
  condition: true,
  ratingAvg: true,
  ratingCount: true,
  createdAt: true,
  sellerId: true,
  images: {
    select: { url: true },
    orderBy: { position: 'asc' },
    take: 1,
  },
  variants: { select: { priceKobo: true, isActive: true } },
  seller: { select: sellerSelect },
} satisfies Prisma.ListingSelect;

export const fullSelect = {
  ...cardSelect,
  description: true,
  updatedAt: true,
  images: {
    select: { id: true, url: true, publicId: true, position: true },
    orderBy: { position: 'asc' },
  },
  variants: {
    select: {
      id: true,
      label: true,
      priceKobo: true,
      stock: true,
      isActive: true,
    },
  },
} satisfies Prisma.ListingSelect;

type CardRow = Prisma.ListingGetPayload<{ select: typeof cardSelect }>;
type FullRow = Prisma.ListingGetPayload<{ select: typeof fullSelect }>;

const cardSeller = (seller: CardRow['seller']) => ({
  id: seller.id,
  displayName: sellerDisplayName(seller),
  verified: seller.verificationStatus === VerificationStatus.VERIFIED,
});

export function toCard(row: CardRow): ListingCardDto {
  return {
    id: row.id,
    title: row.title,
    priceKobo: row.priceKobo,
    ...priceRange(row.priceKobo, row.variants),
    imageUrl: row.images[0]?.url ?? null,
    category: row.category,
    condition: row.condition,
    status: row.status,
    stock: row.stock,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    hasVariants: row.variants.length > 0,
    createdAt: row.createdAt,
    seller: cardSeller(row.seller),
  };
}

// Buyers see a listing's active options only; the owner sees all of them to edit
export function toListingDto(row: FullRow, isOwner: boolean): ListingDto {
  const profile = row.seller.sellerProfile;
  const variants = (
    isOwner ? row.variants : row.variants.filter((v) => v.isActive)
  )
    .slice()
    .sort((a, b) => compareVariantLabels(a.label, b.label));
  return {
    ...toCard(row),
    imageUrl: row.images[0]?.url ?? null,
    description: row.description,
    images: row.images,
    variants,
    seller: {
      ...cardSeller(row.seller),
      storeName: profile?.storeName ?? null,
      logoUrl: profile?.logoUrl ?? null,
      ratingAvg: profile?.ratingAvg ?? 0,
      ratingCount: profile?.ratingCount ?? 0,
      isOnline: profile?.isOnline ?? false,
    },
    isOwner,
    updatedAt: row.updatedAt,
  };
}
