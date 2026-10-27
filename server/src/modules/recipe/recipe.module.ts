import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MediaModule } from '../media/media.module'
import { RecipeController } from './recipe.controller'
import { RecipeService } from './recipe.service'
import { TagController } from './tags.controller'

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [RecipeController, TagController],
  providers: [RecipeService],
})
export class RecipeModule {}
