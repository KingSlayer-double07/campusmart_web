export const UPLOAD_PURPOSES = ['LISTING', 'AVATAR', 'VERIFICATION'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

const FOLDER_BY_PURPOSE: Record<UploadPurpose, string> = {
  LISTING: 'listings',
  AVATAR: 'avatars',
  VERIFICATION: 'verification',
};

// Every user uploads into their own folder, e.g. campusmart/listings/<userId>
export function uploadFolder(purpose: UploadPurpose, userId: string): string {
  return `campusmart/${FOLDER_BY_PURPOSE[purpose]}/${userId}`;
}

// Guide 3.1 rule 4: the URL is on our Cloudinary account, the publicId sits in the folder we
// issued to this user, and the URL really points at that publicId.
export function isOwnUpload(
  image: { url: string; publicId: string },
  cloudName: string,
  folder: string,
): boolean {
  const base = `https://res.cloudinary.com/${cloudName}/`;
  if (!image.url.startsWith(base)) return false;
  if (!image.publicId.startsWith(`${folder}/`)) return false;
  if (image.publicId.includes('..')) return false;
  const path = new URL(image.url).pathname;
  return (
    path.endsWith(`/${image.publicId}`) || path.includes(`/${image.publicId}.`)
  );
}

// For a URL alone (a store logo), the path must sit inside the user's folder
export function isOwnUploadUrl(
  url: string,
  cloudName: string,
  folder: string,
): boolean {
  const base = `https://res.cloudinary.com/${cloudName}/`;
  if (!url.startsWith(base)) return false;
  const path = new URL(url).pathname;
  return path.includes(`/${folder}/`) && !path.includes('..');
}

export interface CloudinaryImageRef {
  type: 'upload' | 'authenticated';
  publicId: string;
  format: string;
}

const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Reads an image URL from an upload response on our account:
// https://res.cloudinary.com/<cloud>/image/<upload|authenticated>/[s--<sig>--/][v<n>/]<publicId>.<format>
// Anything else (another account, transformations, a query string, "..") gives null.
export function parseImageUrl(
  url: string,
  cloudName: string,
): CloudinaryImageRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.search || parsed.hash || url.includes('..')) return null;
  const match = new RegExp(
    `^https://res\\.cloudinary\\.com/${escapeRegex(cloudName)}/image/(upload|authenticated)/` +
      '(?:s--[A-Za-z0-9_-]{8,}--/)?(?:v\\d+/)?([A-Za-z0-9_/-]+)\\.([A-Za-z0-9]{2,5})$',
  ).exec(url);
  if (!match) return null;
  return {
    type: match[1] as CloudinaryImageRef['type'],
    publicId: match[2],
    format: match[3].toLowerCase(),
  };
}
