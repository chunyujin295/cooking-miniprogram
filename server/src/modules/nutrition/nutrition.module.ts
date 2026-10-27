import { Module } from '@nestjs/common'
import { LlmModule } from '../../infra/llm/llm.module'
import { AuthModule } from '../auth/auth.module'
import { NutritionController } from './nutrition.controller'
import { NutritionService } from './nutrition.service'

@Module({
  imports: [AuthModule, LlmModule],
  controllers: [NutritionController],
  providers: [NutritionService],
})
export class NutritionModule {}
