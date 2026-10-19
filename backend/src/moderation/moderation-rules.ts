// Phase 9 moderation rules, from decisions M2-M6

// Decision M3: why a moderator rejects a listing
export const REJECT_REASONS = [
  'PROHIBITED_ITEM',
  'MISLEADING',
  'POOR_PHOTOS',
  'COUNTERFEIT',
  'DUPLICATE',
  'OTHER',
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export const REJECT_REASON_LABELS: Record<RejectReason, string> = {
  PROHIBITED_ITEM: 'Prohibited item',
  MISLEADING: 'Misleading or wrong category',
  POOR_PHOTOS: 'Poor photos',
  COUNTERFEIT: 'Counterfeit',
  DUPLICATE: 'Duplicate',
  OTHER: 'Other',
};

// What a buyer can report a listing for
export const REPORT_REASONS = [
  'PROHIBITED_ITEM',
  'MISLEADING',
  'COUNTERFEIT',
  'SCAM',
  'OFFENSIVE',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

// Decision M4: this many different buyers' open reports send a listing to review
export const REPORTS_TO_FLAG = 5;

// Decision M4c: the banned-word list admins start from, drawn from the M5 prohibited list.
// Whole words and phrases, any case. Admins edit it in settings.
export const STARTER_BANNED_WORDS = [
  // Firearms, ammunition, explosives and weapons
  'gun',
  'pistol',
  'rifle',
  'shotgun',
  'ammunition',
  'ammo',
  'bullets',
  'explosive',
  'explosives',
  'grenade',
  'dynamite',
  // Drugs and controlled substances
  'cocaine',
  'heroin',
  'methamphetamine',
  'crystal meth',
  'codeine',
  'tramadol',
  'marijuana',
  'cannabis',
  'weed',
  // Stolen and counterfeit goods
  'stolen',
  'counterfeit',
  'replica',
  // Fraudulent documents and exam fraud
  'fake id',
  'fake certificate',
  'forged',
  'fake transcript',
  'exam leak',
  'leaked questions',
  'expo',
  // Hazardous chemicals
  'cyanide',
  'acid attack',
];

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The banned words or phrases in a text, as whole words in any case ("gun" isn't in "begun")
export function findBannedWords(text: string, words: string[]): string[] {
  return words.filter((word) =>
    new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(word).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`,
      'iu',
    ).test(text),
  );
}

// Lower case, trimmed, de-duplicated and sorted, so the list reads cleanly in settings
export function normaliseWords(words: string[]): string[] {
  return [
    ...new Set(
      words
        .map((w) => w.trim().toLowerCase().replace(/\s+/g, ' '))
        .filter(Boolean),
    ),
  ].sort();
}
