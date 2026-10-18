import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { STARTER_BANNED_WORDS } from '../moderation/moderation-rules';
import { PrismaService } from '../prisma/prisma.service';
import { BannedWordsService } from './banned-words.service';

describe('BannedWordsService', () => {
  let service: BannedWordsService;
  const prisma = {
    platformSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        BannedWordsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(BannedWordsService);
  });

  it('starts from the prohibited-items list until an admin saves one (M4c)', async () => {
    prisma.platformSetting.findUnique.mockResolvedValue(null);
    const words = await service.list();
    expect(words).toHaveLength(STARTER_BANNED_WORDS.length);
    expect(words).toEqual([...words].sort());
  });

  it('saves a clean list and audits what was added and removed', async () => {
    prisma.platformSetting.findUnique.mockResolvedValue({
      value: ['gun', 'stolen'],
    });
    await expect(
      service.set([' Gun ', 'AIRSOFT', 'airsoft'], 'admin'),
    ).resolves.toEqual(['airsoft', 'gun']);
    expect(prisma.platformSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'bannedWords' },
      create: {
        key: 'bannedWords',
        value: ['airsoft', 'gun'],
        updatedById: 'admin',
      },
      update: { value: ['airsoft', 'gun'], updatedById: 'admin' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      {
        actorId: 'admin',
        action: 'SETTING_CHANGED',
        entityType: 'PlatformSetting',
        entityId: 'bannedWords',
        meta: { added: ['airsoft'], removed: ['stolen'] },
      },
      prisma,
    );
  });

  it('finds the saved words across a listing’s title and description', async () => {
    prisma.platformSetting.findUnique.mockResolvedValue({
      value: ['gun', 'fake id', 7],
    });
    await expect(
      service.findIn('Water gun', undefined, 'Not a fake\nID'),
    ).resolves.toEqual(['gun', 'fake id']);
  });
});
