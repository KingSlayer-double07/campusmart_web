import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import type { Env } from '../config/env';

export interface CloudinarySettings {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

// D15: browsers upload straight to Cloudinary with a signature from us; we never proxy files.
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  // Null until CLOUDINARY_* are set (they're required in production, optional elsewhere)
  get settings(): CloudinarySettings | null {
    const cloudName = this.config.get('CLOUDINARY_CLOUD_NAME', { infer: true });
    const apiKey = this.config.get('CLOUDINARY_API_KEY', { infer: true });
    const apiSecret = this.config.get('CLOUDINARY_API_SECRET', { infer: true });
    return cloudName && apiKey && apiSecret
      ? { cloudName, apiKey, apiSecret }
      : null;
  }

  requireSettings(): CloudinarySettings {
    const settings = this.settings;
    if (!settings) {
      throw new ServiceUnavailableException({
        code: 'UPLOADS_NOT_CONFIGURED',
        message: "Image uploads aren't set up yet. Please try again later.",
      });
    }
    return settings;
  }

  // Cloudinary's own signing helper (guide 3.1 rule 5)
  sign(params: Record<string, string | number>): string {
    return cloudinary.utils.api_sign_request(
      params,
      this.requireSettings().apiSecret,
    );
  }

  // A link to a private (authenticated) image that stops working after `ttlSeconds`. Used for
  // student ID photos, which only admins see. Null until CLOUDINARY_* are set.
  privateImageUrl(
    publicId: string,
    format: string,
    ttlSeconds = 600,
    now = Date.now(),
  ): string | null {
    const settings = this.settings;
    if (!settings) return null;
    // The SDK's types omit the account options it reads, so they ride on a plain object
    const options = {
      type: 'authenticated' as const,
      resource_type: 'image' as const,
      expires_at: Math.floor(now / 1000) + ttlSeconds,
      cloud_name: settings.cloudName,
      api_key: settings.apiKey,
      api_secret: settings.apiSecret,
    };
    return cloudinary.utils.private_download_url(publicId, format, options);
  }

  // Best effort: a failure is logged, never surfaced, so a listing edit never fails on cleanup
  async destroy(publicIds: string[]): Promise<void> {
    const settings = this.settings;
    if (!settings || publicIds.length === 0) return;
    try {
      await cloudinary.api.delete_resources(publicIds, {
        cloud_name: settings.cloudName,
        api_key: settings.apiKey,
        api_secret: settings.apiSecret,
      });
    } catch (error) {
      this.logger.warn(
        `Could not delete ${publicIds.length} Cloudinary image(s): ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`,
      );
    }
  }
}
