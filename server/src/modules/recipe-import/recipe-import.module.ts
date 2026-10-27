import { Module } from '@nestjs/common'
import { LlmModule } from '../../infra/llm/llm.module'
import { AuthModule } from '../auth/auth.module'
import { RecipeImportController } from './recipe-import.controller'
import { RecipeImportService } from './recipe-import.service'
import { UrlFetcherService } from './url-fetcher.service'

@Module({
  imports: [AuthModule, LlmModule],
  controllers: [RecipeImportController],
  providers: [RecipeImportService, UrlFetcherService],
})
export class RecipeImportModule {}
