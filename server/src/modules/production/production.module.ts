import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { NotificationModule } from '../notification/notification.module'
import { ProductionController } from './production.controller'
import { ProductionService } from './production.service'

@Module({
  imports: [AuthModule, NotificationModule],
  controllers: [ProductionController],
  providers: [ProductionService],
})
export class ProductionModule {}
