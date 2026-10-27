import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CreateTagDto } from './dto/list-recipes.query'
import { RecipeService } from './recipe.service'

@Controller('tags')
@UseGuards(JwtAuthGuard)
export class TagController {
  constructor(private readonly recipeService: RecipeService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
  ): Promise<Array<{ id: string; name: string; category: string; recipeCount: number }>> {
    return this.recipeService.listTags(user.userId)
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTagDto,
  ): Promise<{ id: string; name: string; category: string }> {
    return this.recipeService.createTag(user.userId, dto.name, dto.category)
  }
}
