import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitWithin, uploadToCloudinary } from './uploads';

describe('fitWithin', () => {
  it('scales the long edge down to 1600 px and keeps the shape', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('never scales a small photo up', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('uploadToCloudinary', () => {
  const signature = {
    cloudName: 'campusmart',
    apiKey: '123',
    timestamp: 1700000000,
    signature: 'abc',
    folder: 'campusmart/listings/u1',
  };

  class FakeXhr {
    static last: FakeXhr;
    method = '';
    url = '';
    body: FormData | null = null;
    status = 200;
    responseText = '';
    upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
      onprogress: null,
    };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      FakeXhr.last = this;
    }
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    send(body: FormData) {
      this.body = body;
    }
  }

  afterEach(() => vi.unstubAllGlobals());

  it('posts the file with the signed fields and reports progress', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const progress: number[] = [];
    const done = uploadToCloudinary(new Blob(['x']), signature, (f) => progress.push(f));
    const xhr = FakeXhr.last;

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('https://api.cloudinary.com/v1_1/campusmart/image/upload');
    expect(xhr.body!.get('api_key')).toBe('123');
    expect(xhr.body!.get('timestamp')).toBe('1700000000');
    expect(xhr.body!.get('signature')).toBe('abc');
    expect(xhr.body!.get('folder')).toBe('campusmart/listings/u1');
    expect(xhr.body!.get('type')).toBeNull();

    xhr.upload.onprogress!({ lengthComputable: true, loaded: 50, total: 100 });
    xhr.responseText = JSON.stringify({
      secure_url: 'https://res.cloudinary.com/campusmart/image/upload/v1/campusmart/listings/u1/a.jpg',
      public_id: 'campusmart/listings/u1/a',
    });
    xhr.onload!();
    await expect(done).resolves.toEqual({
      url: 'https://res.cloudinary.com/campusmart/image/upload/v1/campusmart/listings/u1/a.jpg',
      publicId: 'campusmart/listings/u1/a',
    });
    expect(progress).toEqual([0.5, 1]);
  });

  it("passes on Cloudinary's error message", async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const done = uploadToCloudinary(new Blob(['x']), signature);
    FakeXhr.last.status = 400;
    FakeXhr.last.responseText = JSON.stringify({ error: { message: 'Stale request' } });
    FakeXhr.last.onload!();
    await expect(done).rejects.toThrow('Stale request');
  });
});
