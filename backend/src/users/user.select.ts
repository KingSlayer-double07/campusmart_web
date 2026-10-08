// The only user shape that may leave the API. Never add password or token columns here.
export const safeUserSelect = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  role: true,
  verificationStatus: true,
  emailVerifiedAt: true,
  trustScore: true,
  institutionId: true,
  isActive: true,
  isSuspended: true,
  createdAt: true,
} as const;
