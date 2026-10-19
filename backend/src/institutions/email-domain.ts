// Institution from email (guide 1.4 rule 1). Pure functions so the rule is unit-tested on its own.

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return domain.includes('.') ? domain : null;
}

// 'students.unilag.edu.ng' -> ['students.unilag.edu.ng', 'unilag.edu.ng', 'edu.ng']
// A bare TLD ('ng') is never a candidate.
export function domainCandidates(domain: string): string[] {
  const labels = domain.toLowerCase().split('.').filter(Boolean);
  const candidates: string[] = [];
  for (let i = 0; i < labels.length - 1; i++) {
    candidates.push(labels.slice(i).join('.'));
  }
  return candidates;
}

// The institution owning the most specific matching domain wins, so a school that lists
// 'students.example.edu' beats one that lists 'example.edu'.
export function pickInstitution<T extends { domains: string[] }>(
  domain: string,
  institutions: T[],
): T | null {
  const candidates = domainCandidates(domain);
  for (const candidate of candidates) {
    const match = institutions.find((i) =>
      i.domains.some((d) => d.toLowerCase() === candidate),
    );
    if (match) return match;
  }
  return null;
}
