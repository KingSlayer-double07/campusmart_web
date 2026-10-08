import { domainCandidates, emailDomain, pickInstitution } from './email-domain';

describe('institution matching from an email domain', () => {
  const unilag = { id: 'unilag', domains: ['unilag.edu.ng'] };
  const unilagStudents = {
    id: 'unilag-students',
    domains: ['students.unilag.edu.ng'],
  };
  const lasu = { id: 'lasu', domains: ['lasu.edu.ng', 'staff.lasu.edu.ng'] };

  it('lowercases and extracts the domain', () => {
    expect(emailDomain('Ada.Obi@Students.UNILAG.edu.ng')).toBe(
      'students.unilag.edu.ng',
    );
    expect(emailDomain('not-an-email')).toBeNull();
    expect(emailDomain('a@localhost')).toBeNull();
  });

  it('lists the domain and each parent, never a bare TLD', () => {
    expect(domainCandidates('students.unilag.edu.ng')).toEqual([
      'students.unilag.edu.ng',
      'unilag.edu.ng',
      'edu.ng',
    ]);
  });

  it('matches an exact domain', () => {
    expect(pickInstitution('lasu.edu.ng', [unilag, lasu])).toBe(lasu);
  });

  it('matches a parent domain (students.unilag.edu.ng -> unilag.edu.ng)', () => {
    expect(pickInstitution('students.unilag.edu.ng', [unilag, lasu])).toBe(
      unilag,
    );
  });

  it('matches any of several domains on one institution', () => {
    expect(pickInstitution('staff.lasu.edu.ng', [unilag, lasu])).toBe(lasu);
  });

  it('prefers the most specific match', () => {
    expect(
      pickInstitution('students.unilag.edu.ng', [unilag, unilagStudents]),
    ).toBe(unilagStudents);
  });

  it('returns null for a non-school domain', () => {
    expect(pickInstitution('gmail.com', [unilag, lasu])).toBeNull();
  });

  it('does not match a lookalike suffix', () => {
    expect(pickInstitution('fakeunilag.edu.ng', [unilag])).toBeNull();
  });
});
