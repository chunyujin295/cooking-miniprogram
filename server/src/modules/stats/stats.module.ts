import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MediaModule } from '../media/media.module'
import { StatsController } from './stats.controller'
import { StatsService } from './stats.service'

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
