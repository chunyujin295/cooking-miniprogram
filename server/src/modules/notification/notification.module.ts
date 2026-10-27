import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { WechatModule } from '../../infra/wechat/wechat.module'
import { NotificationController } from './notification.controller'
import { NotificationService } from './notification.service'

@Module({
  imports: [AuthModule, WechatModule],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
