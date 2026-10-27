import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { ShoppingService, type ShoppingListView } from './shopping.service'

@Controller('shopping-lists')
@UseGuards(JwtAuthGuard)
export class ShoppingController {
  constructor(private readonly shoppingService: ShoppingService) {}

  /** 按餐次取采购清单，不存在则按已提交点菜即时生成 */
  @Get('by-session/:sessionId')
  bySession(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
  ): Promise<ShoppingListView> {
    return this.shoppingService.bySession(user.userId, sessionId)
  }

  @Post('items/:itemId/toggle')
  toggleItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
  ): Promise<{ id: string; isReady: boolean }> {
    return this.shoppingService.toggleItem(user.userId, itemId)
  }
}
