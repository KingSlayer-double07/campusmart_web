import {
  isOwnUpload,
  isOwnUploadUrl,
  parseImageUrl,
  uploadFolder,
} from './cloudinary-urls';

describe('Cloudinary URL checks', () => {
  const folder = uploadFolder('LISTING', 'u1');
  const ok = {
    url: 'https://res.cloudinary.com/campusmart/image/upload/v1700000000/campusmart/listings/u1/abc123.jpg',
    publicId: 'campusmart/listings/u1/abc123',
  };

  it('issues one folder per user and purpose', () => {
    expect(folder).toBe('campusmart/listings/u1');
    expect(uploadFolder('VERIFICATION', 'u1')).toBe(
      'campusmart/verification/u1',
    );
  });

  it('accepts an image uploaded to our account in the user folder', () => {
    expect(isOwnUpload(ok, 'campusmart', folder)).toBe(true);
  });

  it('rejects an image on another Cloudinary account', () => {
    expect(
      isOwnUpload(
        {
          ...ok,
          url: ok.url.replace('/campusmart/image', '/someone-else/image'),
        },
        'campusmart',
        folder,
      ),
    ).toBe(false);
  });

  it("rejects another user's folder, and a URL that isn't that publicId", () => {
    expect(
      isOwnUpload(
        { ...ok, publicId: 'campusmart/listings/u2/abc123' },
        'campusmart',
        folder,
      ),
    ).toBe(false);
    expect(
      isOwnUpload(
        { ...ok, publicId: 'campusmart/listings/u1/other' },
        'campusmart',
        folder,
      ),
    ).toBe(false);
    expect(
      isOwnUpload(
        {
          url: 'http://res.cloudinary.com/campusmart/x.jpg',
          publicId: ok.publicId,
        },
        'campusmart',
        folder,
      ),
    ).toBe(false);
  });

  it('checks a logo URL against the avatar folder', () => {
    const avatars = uploadFolder('AVATAR', 'u1');
    expect(
      isOwnUploadUrl(
        'https://res.cloudinary.com/campusmart/image/upload/v1/campusmart/avatars/u1/logo.png',
        'campusmart',
        avatars,
      ),
    ).toBe(true);
    expect(
      isOwnUploadUrl(
        'https://res.cloudinary.com/campusmart/image/upload/v1/campusmart/avatars/u2/logo.png',
        'campusmart',
        avatars,
      ),
    ).toBe(false);
  });

  describe('parseImageUrl', () => {
    const base = 'https://res.cloudinary.com/campusmart/image';

    it('reads a private upload with its signature and version', () => {
      expect(
        parseImageUrl(
          `${base}/authenticated/s--Ab12Cd34--/v1700000000/campusmart/verification/u-1/card.JPG`,
          'campusmart',
        ),
      ).toEqual({
        type: 'authenticated',
        publicId: 'campusmart/verification/u-1/card',
        format: 'jpg',
      });
      expect(
        parseImageUrl(
          `${base}/upload/campusmart/listings/u1/a.png`,
          'campusmart',
        ),
      ).toEqual({
        type: 'upload',
        publicId: 'campusmart/listings/u1/a',
        format: 'png',
      });
    });

    it('gives null for anything else', () => {
      for (const url of [
        'not a url',
        'http://res.cloudinary.com/campusmart/image/upload/v1/a.jpg',
        'https://res.cloudinary.com/other/image/upload/v1/a.jpg',
        'https://res.cloudinary.com.evil.com/campusmart/image/upload/v1/a.jpg',
        `${base}/private/v1/a.jpg`,
        `${base}/upload/c_fill,w_100/v1/a.jpg`,
        `${base}/upload/v1/a.jpg?x=1`,
        `${base}/upload/v1/a.jpg#x`,
        `${base}/upload/v1/../a.jpg`,
        `${base}/upload/v1/a`,
        'https://res.cloudinary.com/campusmart/video/upload/v1/a.mp4',
      ]) {
        expect(parseImageUrl(url, 'campusmart')).toBeNull();
      }
    });
  });
});
