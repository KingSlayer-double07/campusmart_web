import { describe, expect, it } from 'vitest';
import { isValidDomain, normalizeDomain, splitDomains } from './institution';

describe('institution domains', () => {
  it('normalises case, spaces, a leading @ and a whole email address', () => {
    expect(normalizeDomain(' @Students.UNILAG.edu.ng ')).toBe('students.unilag.edu.ng');
    expect(normalizeDomain('ada@unilag.edu.ng')).toBe('unilag.edu.ng');
  });

  it('accepts real domains and rejects anything else', () => {
    expect(isValidDomain('unilag.edu.ng')).toBe(true);
    expect(isValidDomain('unilag')).toBe(false);
    expect(isValidDomain('uni lag.edu.ng')).toBe(false);
  });

  it('splits pasted lists', () => {
    expect(splitDomains('unilag.edu.ng, Staff.unilag.edu.ng\nlasu.edu.ng')).toEqual([
      'unilag.edu.ng',
      'staff.unilag.edu.ng',
      'lasu.edu.ng',
    ]);
  });

  it('keeps text with spaces whole, so the error quotes what was typed', () => {
    expect(splitDomains('not a domain')).toEqual(['not a domain']);
  });
});
