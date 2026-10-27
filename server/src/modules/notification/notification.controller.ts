import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { loadConfig } from '../../config/env'
import {
  NotificationService,
  type NotificationListView,
} from './notification.service'

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * 公开接口：登录页在拿到 token 前就要读模板 id，
   * 若加鉴权会导致 401 → 跳登录页 → 再请求的无限循环。
   */
  @Get('config')
  config(): { templateIds: string[] } {
    const templates = loadConfig().wechat.templates
    return {
      templateIds: [templates.mealConfirmed, templates.taskAccepted, templates.mealServed].filter(
        (id) => id.length > 0,
      ),
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthUser): Promise<NotificationListView> {
    return this.notificationService.listMine(user.userId)
  }

  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  unread(@CurrentUser() user: AuthUser): Promise<{ unread: number }> {
    return this.notificationService.unreadCount(user.userId)
  }

  @Post('read-all')
  @UseGuards(JwtAuthGuard)
  readAll(@CurrentUser() user: AuthUser): Promise<{ updated: number }> {
    return this.notificationService.markAllRead(user.userId)
  }

  @Post(':id/read')
  @UseGuards(JwtAuthGuard)
  read(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ id: string; readAt: string }> {
    return this.notificationService.markRead(user.userId, id)
  }
}
