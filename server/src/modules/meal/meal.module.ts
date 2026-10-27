import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { NotificationModule } from '../notification/notification.module'
import { PurchaseModule } from '../purchase/purchase.module'
import { MealController } from './meal.controller'
import { MealService } from './meal.service'

@Module({
  imports: [AuthModule, NotificationModule, PurchaseModule],
  controllers: [MealController],
  providers: [MealService],
})
export class MealModule {}
