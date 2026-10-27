import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { IsBoolean } from 'class-validator'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import {
  PurchaseService,
  type ShoppingItemView,
  type ShoppingListView,
} from './purchase.service'

class ToggleItemDto {
  @IsBoolean()
  isReady!: boolean
}

@Controller('shopping-lists')
@UseGuards(JwtAuthGuard)
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  /** 按餐次取采购清单，未生成时返回 null */
  @Get('by-session/:sessionId')
  bySession(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
  ): Promise<ShoppingListView | null> {
    return this.purchaseService.bySession(user.userId, sessionId)
  }

  /** 重新生成（确认菜单后会自动生成，这里供手动刷新） */
  @Post('by-session/:sessionId/generate')
  generate(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
  ): Promise<ShoppingListView> {
    return this.purchaseService.generateForSessionByUser(user.userId, sessionId)
  }

  @Put('items/:itemId')
  toggle(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: ToggleItemDto,
  ): Promise<ShoppingItemView> {
    return this.purchaseService.toggleItem(user.userId, itemId, dto.isReady)
  }
}
