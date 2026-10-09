import { uploadsApi, type UploadPurpose, type UploadSignature } from '@/lib/api/listings';

export const MAX_EDGE = 1600;

// Scales down so the long edge is at most `max`; never scales up
export function fitWithin(width: number, height: number, max = MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Guide 3.2.6f: resize on the phone before uploading, so photos are quick on campus data.
// Images already small enough are sent as they are.
export async function resizeImage(file: File, max = MAX_EDGE): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} isn't an image`);
  const bitmap = await createImageBitmap(file);
  try {
    const size = fitWithin(bitmap.width, bitmap.height, max);
    if (size.width === bitmap.width && size.height === bitmap.height) return file;
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not resize the photo'))), 'image/jpeg', 0.85),
    );
  } finally {
    bitmap.close();
  }
}

export interface UploadedImage {
  url: string;
  publicId: string;
}

// Guide 3.2.6a: POST the file straight to Cloudinary with the server's signature. XHR rather than
// fetch, because fetch can't report upload progress.
export function uploadToCloudinary(
  file: Blob,
  signature: UploadSignature,
  onProgress?: (fraction: number) => void,
): Promise<UploadedImage> {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);
  if (signature.type) form.append('type', signature.type);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: { secure_url?: string; public_id?: string; error?: { message?: string } } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // fall through to the error below
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.secure_url && body.public_id) {
        onProgress?.(1);
        resolve({ url: body.secure_url, publicId: body.public_id });
      } else {
        reject(new Error(body.error?.message ?? 'The photo upload failed. Please try again.'));
      }
    };
    xhr.onerror = () => reject(new Error('The photo upload failed. Check your connection and try again.'));
    xhr.send(form);
  });
}

// One signature (valid for an hour) covers every photo in a submit
export async function uploadImages(
  files: File[],
  purpose: UploadPurpose,
  onProgress: (index: number, fraction: number) => void,
): Promise<UploadedImage[]> {
  if (files.length === 0) return [];
  const signature = await uploadsApi.signature(purpose);
  return Promise.all(
    files.map(async (file, index) => {
      const blob = await resizeImage(file);
      return uploadToCloudinary(blob, signature, (fraction) => onProgress(index, fraction));
    }),
  );
}
