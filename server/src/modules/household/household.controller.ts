import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { AcceptInviteDto } from './dto/accept-invite.dto'
import { CreateHouseholdDto } from './dto/create-household.dto'
import { HouseholdService, type HouseholdView } from './household.service'

@Controller()
@UseGuards(JwtAuthGuard)
export class HouseholdController {
  constructor(private readonly householdService: HouseholdService) {}

  @Post('households')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHouseholdDto,
  ): Promise<{ id: string; name: string }> {
    return this.householdService.create(user.userId, dto.name)
  }

  @Get('households/current')
  current(@CurrentUser() user: AuthUser): Promise<HouseholdView> {
    return this.householdService.current(user.userId)
  }

  @Post('households/current/invites')
  createInvite(
    @CurrentUser() user: AuthUser,
  ): Promise<{ code: string; expiresAt: Date }> {
    return this.householdService.createInvite(user.userId)
  }

  @Post('household-invites/accept')
  acceptInvite(
    @CurrentUser() user: AuthUser,
    @Body() dto: AcceptInviteDto,
  ): Promise<{ householdId: string }> {
    return this.householdService.acceptInvite(user.userId, dto.code)
  }
}