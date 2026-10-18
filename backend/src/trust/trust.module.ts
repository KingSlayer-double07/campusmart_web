import { Module } from '@nestjs/common';
import { TrustService } from './trust.service';

// Phase 8: the nightly trust score (guide 8.4, R1, R2)
@Module({
  providers: [TrustService],
  exports: [TrustService],
})
export class TrustModule {}
