import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import {
  UploadSignatureDto,
  UploadSignatureRequestDto,
} from './dto/upload-signature.dto';
import { UploadsService } from './uploads.service';

@ApiTags('Uploads')
@RequireVerifiedEmail()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @ApiOperation({
    summary: 'Get a signature for a direct upload to Cloudinary',
    description:
      'POST the file to https://api.cloudinary.com/v1_1/<cloudName>/image/upload with file, api_key, ' +
      'timestamp, signature and folder (and type for VERIFICATION). Valid for one hour.',
  })
  @ApiOkEnvelope(UploadSignatureDto)
  @ApiResponse({
    status: 503,
    type: ErrorResponseDto,
    description: 'UPLOADS_NOT_CONFIGURED',
  })
  @Post('signature')
  @HttpCode(HttpStatus.OK)
  signature(
    @Body() dto: UploadSignatureRequestDto,
    @CurrentUser() user: AuthUser,
  ): UploadSignatureDto {
    return this.uploads.signature(user.id, dto.purpose);
  }
}
