import { Injectable } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { uploadFolder, type UploadPurpose } from './cloudinary-urls';
import type { UploadSignatureDto } from './dto/upload-signature.dto';

@Injectable()
export class UploadsService {
  constructor(private readonly cloudinary: CloudinaryService) {}

  // Guide 3.1 rule 5: sign { folder, timestamp }. Verification documents are private
  // ('authenticated'), so the type is part of what's signed.
  signature(userId: string, purpose: UploadPurpose): UploadSignatureDto {
    const { cloudName, apiKey } = this.cloudinary.requireSettings();
    const folder = uploadFolder(purpose, userId);
    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, string | number> = { folder, timestamp };
    if (purpose === 'VERIFICATION') params.type = 'authenticated';
    return {
      cloudName,
      apiKey,
      timestamp,
      folder,
      signature: this.cloudinary.sign(params),
      ...(purpose === 'VERIFICATION' && { type: 'authenticated' as const }),
    };
  }
}
