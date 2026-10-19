import { fetchApi } from './client';
import type { components } from './schema';

// Generated from the API's OpenAPI document (D5); never hand-write these
export type User = components['schemas']['UserDto'];
export type UserRole = components['schemas']['UserRole'];
export type VerificationStatus = components['schemas']['VerificationStatus'];
export type AccountType = components['schemas']['AccountType'];
export type Session = components['schemas']['SessionDto'];
type RegisterBody = components['schemas']['RegisterDto'];
type LoginBody = components['schemas']['LoginDto'];
type ResetPasswordBody = components['schemas']['ResetPasswordDto'];
type ChangePasswordBody = components['schemas']['ChangePasswordDto'];
export type UpdateProfileBody = components['schemas']['UpdateProfileDto'];
export type DeleteAccountBody = components['schemas']['DeleteAccountDto'];
export type AuthProviders = components['schemas']['AuthProvidersDto'];

const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  ...(body !== undefined && { body: JSON.stringify(body) }),
});

export const authApi = {
  register: (body: RegisterBody) => fetchApi<User>('/auth/register', post(body)),
  login: (body: LoginBody) => fetchApi<User>('/auth/login', post(body)),
  logout: () => fetchApi<void>('/auth/logout', post()),
  refresh: () => fetchApi<void>('/auth/refresh', post()),
  me: () => fetchApi<User>('/auth/me'),
  providers: () => fetchApi<AuthProviders>('/auth/providers'),
  verifyEmail: (code: string) => fetchApi<User>('/auth/verify-email', post({ code })),
  resendVerification: () => fetchApi<void>('/auth/verify-email/resend', post()),
  forgotPassword: (email: string) => fetchApi<void>('/auth/forgot-password', post({ email })),
  resetPassword: (body: ResetPasswordBody) => fetchApi<void>('/auth/reset-password', post(body)),
};

export const accountApi = {
  updateProfile: (body: UpdateProfileBody) =>
    fetchApi<User>('/users/me/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  // Decision T6: personal details anonymised, orders kept
  deleteAccount: (body: DeleteAccountBody) =>
    fetchApi<void>('/users/me', { method: 'DELETE', body: JSON.stringify(body) }),
  changePassword: (body: ChangePasswordBody) =>
    fetchApi<void>('/users/me/password', { method: 'PATCH', body: JSON.stringify(body) }),
  sessions: () => fetchApi<Session[]>('/users/me/sessions'),
  revokeSession: (id: string) => fetchApi<void>(`/users/me/sessions/${id}`, { method: 'DELETE' }),
  revokeOtherSessions: () => fetchApi<void>('/users/me/sessions', { method: 'DELETE' }),
};
