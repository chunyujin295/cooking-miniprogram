import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { parseTagIds } from '../recipe/dto/list-recipes.query'
import {
  StatsService,
  type RandomDishView,
  type StatsOverviewView,
} from './stats.service'

@Controller('stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('overview')
  overview(
    @CurrentUser() user: AuthUser,
    @Query('days') days?: string,
  ): Promise<StatsOverviewView> {
    const parsed = Number(days)
    return this.statsService.overview(user.userId, parsed === 30 ? 30 : 7)
  }

  @Get('random')
  random(
    @CurrentUser() user: AuthUser,
    @Query('count') count?: string,
    @Query('tagIds') tagIds?: string,
    @Query('excludeDays') excludeDays?: string,
  ): Promise<RandomDishView[]> {
    const parsedCount = Math.min(Math.max(Number(count) || 1, 1), 5)
    const parsedDays = Math.min(Math.max(Number(excludeDays) || 3, 0), 30)
    return this.statsService.random(user.userId, parsedCount, parseTagIds(tagIds), parsedDays)
  }
}
