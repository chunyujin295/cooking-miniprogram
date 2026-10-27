import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CreateRecipeDto } from './dto/create-recipe.dto'
import { ListRecipesQuery } from './dto/list-recipes.query'
import {
  RecipeService,
  type RecipeDetailView,
  type RecipeListItemView,
} from './recipe.service'

@Controller('recipes')
@UseGuards(JwtAuthGuard)
export class RecipeController {
  constructor(private readonly recipeService: RecipeService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListRecipesQuery,
  ): Promise<RecipeListItemView[]> {
    return this.recipeService.list(user.userId, query)
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<RecipeDetailView> {
    return this.recipeService.detail(user.userId, id)
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRecipeDto,
  ): Promise<RecipeDetailView> {
    return this.recipeService.create(user.userId, dto)
  }

  /** 小程序 wx.request 不支持 PATCH，整体覆盖用 PUT */
  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateRecipeDto,
  ): Promise<RecipeDetailView> {
    return this.recipeService.update(user.userId, id, dto)
  }

  @Post(':id/archive')
  archive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ id: string; isArchived: boolean }> {
    return this.recipeService.archive(user.userId, id)
  }

  @Post(':id/restore')
  restore(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ id: string; isArchived: boolean }> {
    return this.recipeService.restore(user.userId, id)
  }
}
