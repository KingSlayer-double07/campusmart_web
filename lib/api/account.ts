import { fetchApi } from './client';
import type { components } from './schema';
import type { User } from './auth';

// Generated from the API's OpenAPI document (D5)
export type Institution = components['schemas']['InstitutionDto'];

const json = (method: 'POST' | 'PATCH', body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined && { body: JSON.stringify(body) }),
});

// Decisions T1, G1, G2 and G4: choosing a school, and becoming a seller with a school email
export const accountApi = {
  institutions: () => fetchApi<Institution[]>('/institutions'),
  setInstitution: (institutionId: string) => fetchApi<User>('/users/me/institution', json('PATCH', { institutionId })),
  sendSchoolEmailCode: (email: string) => fetchApi<void>('/users/me/school-email', json('POST', { email })),
  verifySchoolEmail: (code: string) => fetchApi<User>('/users/me/school-email/verify', json('POST', { code })),
  becomeSeller: () => fetchApi<User>('/users/me/become-seller', json('POST')),
};
