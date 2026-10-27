import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'

/**
 * 家庭范围守卫（骨架占位）。
 * 阶段 0 接入：解析微信会话 → 校验 household_members 关系 → 注入 householdId。
 * 客户端传入的 userId / householdId 不能直接作为授权依据。
 */
@Injectable()
export class HouseholdMemberGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true
  }
}