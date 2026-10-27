import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CreateMealSessionDto, SaveOrderDto } from './dto/meal.dto'
import {
  MealService,
  type CalendarDayView,
  type MealSessionDetailView,
  type MealSessionView,
} from './meal.service'

@Controller('meal-sessions')
@UseGuards(JwtAuthGuard)
export class MealController {
  constructor(private readonly mealService: MealService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('date') date: string): Promise<MealSessionView[]> {
    return this.mealService.listByDate(user.userId, date)
  }

  /** 月历：按日返回餐次状态（放在 :id 之前，避免路由冲突） */
  @Get('calendar')
  calendar(
    @CurrentUser() user: AuthUser,
    @Query('month') month: string,
  ): Promise<{ month: string; days: CalendarDayView[] }> {
    return this.mealService.calendar(user.userId, month)
  }

  @Post()
  createOrGet(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMealSessionDto,
  ): Promise<MealSessionView> {
    return this.mealService.createOrGet(user.userId, dto)
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<MealSessionDetailView> {
    return this.mealService.detail(user.userId, id)
  }

  /** 删除空餐次：仅未开始/点菜中，且没有任何已提交的点菜单时允许 */
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ id: string }> {
    return this.mealService.remove(user.userId, id)
  }

  @Put(':id/orders/mine')
  saveMyOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SaveOrderDto,
  ): Promise<MealSessionDetailView> {
    return this.mealService.saveMyOrder(user.userId, id, dto)
  }

  @Post(':id/orders/mine/submit')
  submitMyOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<MealSessionDetailView> {
    return this.mealService.submitMyOrder(user.userId, id)
  }

  /** 仅家庭创建者可确认，确认后生成汇总与制作任务 */
  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<MealSessionDetailView> {
    return this.mealService.confirm(user.userId, id)
  }
}
