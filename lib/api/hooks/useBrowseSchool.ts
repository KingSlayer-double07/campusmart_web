import { useAuthStore } from '@/app/store/useAuthStore';
import { useGuestStore } from '@/app/store/useGuestStore';

// Which school the listing reads ask for (decision 2026-10-19). Signed in, none: the API uses
// your own, and a lapsed session answers 401 so it gets refreshed. Signed out, the school the
// guest picked. `ready` is false for a guest who hasn't picked one, so nothing is fetched.
export function useBrowseSchool(): { institutionId: string | undefined; ready: boolean } {
  const signedIn = useAuthStore((s) => !!s.user);
  const guestSchoolId = useGuestStore((s) => s.school?.id);
  if (signedIn) return { institutionId: undefined, ready: true };
  return { institutionId: guestSchoolId, ready: !!guestSchoolId };
}
