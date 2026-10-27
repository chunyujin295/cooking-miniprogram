import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PurchaseController } from './purchase.controller'
import { PurchaseService } from './purchase.service'

@Module({
  imports: [AuthModule],
  controllers: [PurchaseController],
  providers: [PurchaseService],
  exports: [PurchaseService],
})
export class PurchaseModule {}
