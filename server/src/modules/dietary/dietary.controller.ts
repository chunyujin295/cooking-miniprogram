import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { UpdateDietaryDto } from './dto/update-dietary.dto'
import {
  DietaryService,
  type DietaryCheckItem,
  type DietaryProfileView,
} from './dietary.service'

@Controller('dietary')
@UseGuards(JwtAuthGuard)
export class DietaryController {
  constructor(private readonly dietaryService: DietaryService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<DietaryProfileView> {
    return this.dietaryService.me(user.userId)
  }

  @Put('me')
  update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateDietaryDto,
  ): Promise<DietaryProfileView> {
    return this.dietaryService.update(user.userId, dto)
  }

  /** 点菜时校验：命中本人过敏原/忌口的菜谱，仅提示不阻断 */
  @Get('check')
  check(
    @CurrentUser() user: AuthUser,
    @Query('recipeIds') recipeIds?: string,
  ): Promise<DietaryCheckItem[]> {
    const ids = (recipeIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
    return this.dietaryService.check(user.userId, ids)
  }
}
