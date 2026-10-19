import { Module } from '@nestjs/common';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

// Phase 8: favourites in the account (guide 8.1, decision R5)
@Module({
  providers: [WishlistService],
  controllers: [WishlistController],
})
export class WishlistModule {}
