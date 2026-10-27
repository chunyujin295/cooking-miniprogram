import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { PrismaService } from '../../infra/database/prisma.service'
import { STORAGE_ADAPTER, type StorageAdapter } from '../../infra/storage/storage.adapter'

const INVITE_TTL_DAYS = 7
const INVITE_MAX_USES = 3

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export interface HouseholdView {
  household: { id: string; name: string; timezone: string; ownerUserId: string }
  role: string
  members: Array<{
    userId: string
    nickname: string | null
    avatarUrl: string | null
    role: string
    joinedAt: Date
  }>
}

@Injectable()
export class HouseholdService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  /** 建家庭：创建者 + owner 成员 + 空忌口档案，同一事务完成 */
  async create(userId: string, name: string): Promise<{ id: string; name: string }> {
    const existing = await this.prisma.householdMember.findFirst({
      where: { userId, status: 'active' },
    })
    if (existing) {
      throw new ConflictException('已加入家庭，第一版一个用户只能属于一个家庭')
    }

    return this.prisma.$transaction(async (tx) => {
      const household = await tx.household.create({
        data: { name, ownerUserId: userId },
      })
      await tx.householdMember.create({
        data: { householdId: household.id, userId, role: 'owner', status: 'active' },
      })
      await tx.memberDietaryProfile.create({
        data: { householdId: household.id, userId },
      })
      return { id: household.id, name: household.name }
    })
  }

  async current(userId: string): Promise<HouseholdView> {
    const membership = await this.prisma.householdMember.findFirst({
      where: { userId, status: 'active' },
      include: { household: true },
    })
    if (!membership) {
      throw new NotFoundException('尚未加入家庭')
    }

    const members = await this.prisma.householdMember.findMany({
      where: { householdId: membership.householdId, status: 'active' },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    })

    return {
      household: {
        id: membership.household.id,
        name: membership.household.name,
        timezone: membership.household.timezone,
        ownerUserId: membership.household.ownerUserId,
      },
      role: membership.role,
      members: members.map((m) => ({
        userId: m.userId,
        nickname: m.user.nickname,
        avatarUrl: m.user.avatarUrl
          ? this.storage.signGetUrl(m.user.avatarUrl, 7 * 24 * 60 * 60)
          : null,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    }
  }

  /** 生成邀请码：只存哈希，明文只返回一次 */
  async createInvite(userId: string): Promise<{ code: string; expiresAt: Date }> {
    const membership = await this.prisma.householdMember.findFirst({
      where: { userId, status: 'active' },
    })
    if (!membership) {
      throw new NotFoundException('尚未加入家庭')
    }
    if (membership.role !== 'owner') {
      throw new ForbiddenException('只有家庭创建者可以生成邀请码')
    }

    const code = randomBytes(4).toString('hex').toUpperCase()
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

    await this.prisma.householdInvite.create({
      data: {
        householdId: membership.householdId,
        codeHash: hashCode(code),
        expiresAt,
        maxUses: INVITE_MAX_USES,
        createdBy: userId,
      },
    })

    return { code, expiresAt }
  }

  async acceptInvite(userId: string, code: string): Promise<{ householdId: string }> {
    const invite = await this.prisma.householdInvite.findFirst({
      where: { codeHash: hashCode(code.trim().toUpperCase()) },
    })
    if (!invite) {
      throw new NotFoundException('邀请码无效')
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('邀请码已过期')
    }

    const existing = await this.prisma.householdMember.findFirst({
      where: { userId, status: 'active' },
    })
    if (existing) {
      if (existing.householdId === invite.householdId) {
        return { householdId: invite.householdId }
      }
      throw new ConflictException('已加入其他家庭')
    }

    return this.prisma.$transaction(async (tx) => {
      // 条件更新，防止并发下超用
      const updated = await tx.householdInvite.updateMany({
        where: { id: invite.id, usedCount: { lt: invite.maxUses } },
        data: { usedCount: { increment: 1 } },
      })
      if (updated.count === 0) {
        throw new BadRequestException('邀请码已被用完')
      }

      await tx.householdMember.create({
        data: {
          householdId: invite.householdId,
          userId,
          role: 'member',
          status: 'active',
        },
      })

      await tx.memberDietaryProfile.upsert({
        where: {
          householdId_userId: { householdId: invite.householdId, userId },
        },
        update: {},
        create: { householdId: invite.householdId, userId },
      })

      return { householdId: invite.householdId }
    })
  }
}