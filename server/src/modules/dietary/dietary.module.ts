import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DietaryController } from './dietary.controller'
import { DietaryService } from './dietary.service'

@Module({
  imports: [AuthModule],
  controllers: [DietaryController],
  providers: [DietaryService],
})
export class DietaryModule {}
