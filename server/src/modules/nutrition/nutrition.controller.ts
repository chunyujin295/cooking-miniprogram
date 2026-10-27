import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { SaveNutritionDto } from './dto/save-nutrition.dto'
import { NutritionService, type EstimateResultView } from './nutrition.service'
import type { NutritionView } from './nutrition.types'

@Controller('recipes/:recipeId/nutrition')
@UseGuards(JwtAuthGuard)
export class NutritionController {
  constructor(private readonly service: NutritionService) {}

  @Get()
  get(
    @CurrentUser() user: AuthUser,
    @Param('recipeId') recipeId: string,
  ): Promise<NutritionView | null> {
    return this.service.get(user.userId, recipeId)
  }

  /** 保存每份营养值（手动录入或模板整理，均不调用模型） */
  @Post()
  save(
    @CurrentUser() user: AuthUser,
    @Param('recipeId') recipeId: string,
    @Body() dto: SaveNutritionDto,
  ): Promise<NutritionView> {
    return this.service.save(user.userId, recipeId, dto)
  }

  /** 清空营养数据：编辑页把数值全部清空后保存时调用 */
  @Delete()
  remove(
    @CurrentUser() user: AuthUser,
    @Param('recipeId') recipeId: string,
  ): Promise<{ recipeId: string }> {
    return this.service.remove(user.userId, recipeId)
  }

  /** 内置估算（保留备用，小程序不再暴露入口） */
  @Post('estimate')
  estimate(
    @CurrentUser() user: AuthUser,
    @Param('recipeId') recipeId: string,
  ): Promise<EstimateResultView> {
    return this.service.estimate(user.userId, recipeId)
  }

  @Post('confirm')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('recipeId') recipeId: string,
  ): Promise<NutritionView> {
    return this.service.confirm(user.userId, recipeId)
  }
}
