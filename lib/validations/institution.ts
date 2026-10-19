// Mirrors the API's rules for institution domains (backend/src/admin/dto/institution.dto.ts)
export const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

// ' @Students.UNILAG.edu.ng ' -> 'students.unilag.edu.ng'. A pasted email keeps only its domain.
export function normalizeDomain(raw: string): string {
  const value = raw.trim().toLowerCase();
  return value.includes('@') ? value.slice(value.lastIndexOf('@') + 1) : value;
}

export function isValidDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain);
}

// Splits pasted text such as "unilag.edu.ng, staff.unilag.edu.ng" (or one per line) into
// normalised domains. Spaces don't split, so "uni lag.edu.ng" is reported whole.
export function splitDomains(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map(normalizeDomain)
    .filter(Boolean);
}
