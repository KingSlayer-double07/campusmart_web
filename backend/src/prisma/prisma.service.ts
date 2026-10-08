import "dotenv/config";
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({connectionString: process.env.DATABASE_URL!});
const prisma = new PrismaClient({ adapter });

@Injectable()
export class PrismaService extends PrismaClient  implements OnModuleInit, OnModuleDestroy {
    constructor() {
        super({
            adapter: new PrismaPg({connectionString: process.env.DATABASE_URL!}) });
    }
    get user() { return prisma.user}
    get listing() { return prisma.listing; }
    get listingImage() { return prisma.listingImage; }
    get order() { return prisma.order; }
    get orderItem() { return prisma.orderItem; }
    get payment() { return prisma.payment; }
    get review() { return prisma.review; }
    get wishlist() { return prisma.wishlist; }
    get institution() { return prisma.institution; }
    get verificationRequest() { return prisma.verificationRequest; }
    get moderationAction() { return prisma.moderationAction; }
    
    async onModuleInit() {
        await prisma.$connect();
    }

    async onModuleDestroy() {
        await prisma.$disconnect();
    }
}