import { Module } from '@nestjs/common';
import { AdminInstitutionsController } from './admin-institutions.controller';
import { AdminInstitutionsService } from './admin-institutions.service';
import { AdminPickupStationsController } from './admin-pickup-stations.controller';
import { AdminPickupStationsService } from './admin-pickup-stations.service';

// The admin console's API (D16), all under /api/admin/*. Grows with each phase (guide 9.1).
@Module({
  controllers: [AdminInstitutionsController, AdminPickupStationsController],
  providers: [AdminInstitutionsService, AdminPickupStationsService],
})
export class AdminModule {}
