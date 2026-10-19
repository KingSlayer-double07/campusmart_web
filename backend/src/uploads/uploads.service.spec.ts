import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryService } from './cloudinary.service';
import { UploadsService } from './uploads.service';

const config = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService<
    never,
    true
  >;

describe('UploadsService', () => {
  const settings = {
    CLOUDINARY_CLOUD_NAME: 'campusmart',
    CLOUDINARY_API_KEY: '123456789012345',
    CLOUDINARY_API_SECRET: 'shh',
  };

  it('signs { folder, timestamp } for the user folder with the API secret', () => {
    const service = new UploadsService(new CloudinaryService(config(settings)));
    const result = service.signature('u1', 'LISTING');
    expect(result).toMatchObject({
      cloudName: 'campusmart',
      apiKey: '123456789012345',
      folder: 'campusmart/listings/u1',
    });
    expect(result).not.toHaveProperty('type');
    expect(result.signature).toBe(
      cloudinary.utils.api_sign_request(
        { folder: 'campusmart/listings/u1', timestamp: result.timestamp },
        'shh',
      ),
    );
    expect(Math.abs(result.timestamp - Date.now() / 1000)).toBeLessThan(5);
    expect(JSON.stringify(result)).not.toContain('shh');
  });

  it('makes verification uploads private (type authenticated is signed)', () => {
    const service = new UploadsService(new CloudinaryService(config(settings)));
    const result = service.signature('u1', 'VERIFICATION');
    expect(result.type).toBe('authenticated');
    expect(result.signature).toBe(
      cloudinary.utils.api_sign_request(
        {
          folder: 'campusmart/verification/u1',
          timestamp: result.timestamp,
          type: 'authenticated',
        },
        'shh',
      ),
    );
  });

  it('answers 503 UPLOADS_NOT_CONFIGURED without Cloudinary settings', () => {
    const service = new UploadsService(new CloudinaryService(config({})));
    expect(() => service.signature('u1', 'AVATAR')).toThrow(
      ServiceUnavailableException,
    );
  });
});
