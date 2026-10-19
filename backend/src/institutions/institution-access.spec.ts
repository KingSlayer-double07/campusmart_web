import { UserRole } from '../generated/prisma/enums';
import { blockedByInstitution } from './institution-access';

describe('blockedByInstitution', () => {
  const inactive = { isActive: false };
  const active = { isActive: true };

  it.each([UserRole.BUYER, UserRole.SELLER, UserRole.PICKUP_AGENT])(
    'blocks a %s at an inactive institution',
    (role) => {
      expect(blockedByInstitution({ role, institution: inactive })).toBe(true);
    },
  );

  it('lets admins in even when their institution is inactive', () => {
    expect(
      blockedByInstitution({ role: UserRole.ADMIN, institution: inactive }),
    ).toBe(false);
  });

  it('lets everyone in at an active institution, or with no institution', () => {
    expect(
      blockedByInstitution({ role: UserRole.BUYER, institution: active }),
    ).toBe(false);
    expect(
      blockedByInstitution({ role: UserRole.BUYER, institution: null }),
    ).toBe(false);
  });
});
