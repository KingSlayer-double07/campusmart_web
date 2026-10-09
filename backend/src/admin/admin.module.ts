import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminInstitutionsController } from './admin-institutions.controller';
import { AdminInstitutionsService } from './admin-institutions.service';
import { AdminPickupStationsController } from './admin-pickup-stations.controller';
import { AdminPickupStationsService } from './admin-pickup-stations.service';
import { AdminVerificationController } from './admin-verification.controller';
import { AdminVerificationService } from './admin-verification.service';

// The admin console's API (D16), all under /api/admin/*. Grows with each phase (guide 9.1).
@Module({
  imports: [UploadsModule],
  controllers: [
    AdminInstitutionsController,
    AdminPickupStationsController,
    AdminVerificationController,
  ],
  providers: [
    AdminInstitutionsService,
    AdminPickupStationsService,
    AdminVerificationService,
  ],
})
export class AdminModule {}
