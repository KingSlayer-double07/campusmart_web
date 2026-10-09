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
