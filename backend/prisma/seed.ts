// Seed (guide 2.3): one institution, two pickup stations and the first admin.
// Run with `npx prisma db seed` (registered in prisma.config.ts under migrations.seed).
// Safe to run again: existing rows are kept, and an existing admin's password is never changed.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcrypt';
import {
  PASSWORD_MESSAGE,
  PASSWORD_RULE,
} from '../src/auth/decorators/is-campusmart-password.decorator';
import { PrismaClient } from '../src/generated/prisma/client';
import { UserRole } from '../src/generated/prisma/enums';
import { emailDomain, pickInstitution } from '../src/institutions/email-domain';

// TODO(Collins): replace with your school's real name and email domains before seeding a
// shared database. Sign-up only accepts emails on these domains (or their sub-domains).
export const SEED_INSTITUTION = {
  name: 'University of Lagos',
  domains: ['unilag.edu.ng'],
};

// TODO(Collins): replace with the real stations, contacts and hours.
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
export const SEED_STATIONS = [
  {
    name: 'Main Gate Pickup Point',
    address: 'Main Gate, University Road',
    contactName: 'Station Agent',
    contactPhone: '+2348000000001',
    openingHours: [
      ...WEEKDAYS.map((day) => ({ day, open: '09:00', close: '17:00' })),
      { day: 'SAT', open: '10:00', close: '14:00' },
    ],
  },
  {
    name: 'Student Union Building Pickup Point',
    address: 'Student Union Building, Ground Floor',
    contactName: 'Station Agent',
    contactPhone: '+2348000000002',
    openingHours: WEEKDAYS.map((day) => ({
      day,
      open: '10:00',
      close: '18:00',
    })),
  },
];

const BCRYPT_ROUNDS = 12; // same cost as AuthService

export async function seed(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
) {
  const adminEmail = env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to seed.');
  }
  if (!PASSWORD_RULE.test(adminPassword)) {
    throw new Error(`SEED_ADMIN_PASSWORD: ${PASSWORD_MESSAGE}`);
  }

  const institution = await prisma.institution.upsert({
    where: { name: SEED_INSTITUTION.name },
    update: {},
    create: SEED_INSTITUTION,
  });

  const stations: { id: string; name: string }[] = [];
  for (const station of SEED_STATIONS) {
    const existing = await prisma.pickupStation.findFirst({
      where: { institutionId: institution.id, name: station.name },
      select: { id: true, name: true },
    });
    stations.push(
      existing ??
        (await prisma.pickupStation.create({
          data: { ...station, institutionId: institution.id },
          select: { id: true, name: true },
        })),
    );
  }

  // The admin joins the seeded institution when their email is on one of its domains.
  const domain = emailDomain(adminEmail);
  const adminInstitution =
    domain && pickInstitution(domain, [institution]) ? institution.id : null;
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: UserRole.ADMIN },
    create: {
      email: adminEmail,
      password: await hash(adminPassword, BCRYPT_ROUNDS),
      role: UserRole.ADMIN,
      institutionId: adminInstitution,
      // Seeded, so there's no code to receive; the address is the operator's own.
      emailVerifiedAt: new Date(),
    },
    select: { id: true, email: true, role: true },
  });

  return { institution, stations, admin };
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    const { institution, stations, admin } = await seed(prisma);
    console.log(
      `Seeded institution "${institution.name}" (${institution.domains.join(', ')}), ` +
        `${stations.length} pickup stations and admin ${admin.email}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
