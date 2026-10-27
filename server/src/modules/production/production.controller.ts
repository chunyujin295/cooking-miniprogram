import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { ProductionService, type ProductionTaskView } from './production.service'

@Controller('production/tasks')
@UseGuards(JwtAuthGuard)
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: 'active' | 'all',
  ): Promise<ProductionTaskView[]> {
    return this.productionService.list(user.userId, scope === 'all' ? 'all' : 'active')
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ProductionTaskView> {
    return this.productionService.detail(user.userId, id)
  }

  /** 接单：并发下只有一个人能认领成功 */
  @Post(':id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ProductionTaskView> {
    return this.productionService.accept(user.userId, id)
  }

  @Post(':id/start')
  start(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ProductionTaskView> {
    return this.productionService.start(user.userId, id)
  }

  @Post(':id/items/:itemId/complete')
  completeItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<ProductionTaskView> {
    return this.productionService.completeItem(user.userId, id, itemId)
  }

  /** 整餐出餐：所有菜品完成后才允许 */
  @Post(':id/serve')
  serve(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ProductionTaskView> {
    return this.productionService.serve(user.userId, id)
  }
}
