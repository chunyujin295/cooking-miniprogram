import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CreateRecipeImportDto, LinkRecipeDto } from './dto/create-recipe-import.dto'
import { RecipeImportService, type ImportResultView } from './recipe-import.service'

@Controller('recipe-imports')
@UseGuards(JwtAuthGuard)
export class RecipeImportController {
  constructor(private readonly service: RecipeImportService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRecipeImportDto,
  ): Promise<ImportResultView> {
    return this.service.create(user.userId, dto)
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user.userId, id)
  }

  @Post(':id/link')
  link(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LinkRecipeDto,
  ): Promise<{ id: string; recipeId: string }> {
    return this.service.link(user.userId, id, dto.recipeId)
  }
}
