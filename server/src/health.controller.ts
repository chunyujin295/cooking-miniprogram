import { Controller, Get } from '@nestjs/common'
import { PrismaService } from './infra/database/prisma.service'

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check(): { status: string; time: string } {
    return { status: 'ok', time: new Date().toISOString() }
  }

  @Get('db')
  async db(): Promise<{ status: string }> {
    await this.prisma.$queryRaw`select 1`
    return { status: 'ok' }
  }
}