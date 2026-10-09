import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { CloudinaryService } from './cloudinary.service';

const serviceWith = (values: Partial<Env>) =>
  new CloudinaryService({
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>);

describe('CloudinaryService.privateImageUrl', () => {
  it('signs a download link for a private image that expires after 10 minutes', () => {
    const service = serviceWith({
      CLOUDINARY_CLOUD_NAME: 'campusmart',
      CLOUDINARY_API_KEY: '123',
      CLOUDINARY_API_SECRET: 'not-a-real-secret',
    });
    const now = Date.UTC(2026, 9, 9, 12, 0, 0);
    const link = new URL(
      service.privateImageUrl(
        'campusmart/verification/u1/card',
        'jpg',
        600,
        now,
      )!,
    );

    expect(link.origin + link.pathname).toBe(
      'https://api.cloudinary.com/v1_1/campusmart/image/download',
    );
    expect(Object.fromEntries(link.searchParams)).toMatchObject({
      public_id: 'campusmart/verification/u1/card',
      format: 'jpg',
      type: 'authenticated',
      expires_at: String(now / 1000 + 600),
      api_key: '123',
    });
    expect(link.searchParams.get('signature')).toMatch(/^[0-9a-f]{40}$/);
    expect(link.toString()).not.toContain('not-a-real-secret');
  });

  it('gives null until Cloudinary is set up', () => {
    expect(
      serviceWith({}).privateImageUrl('campusmart/verification/u1/card', 'jpg'),
    ).toBeNull();
  });
});
