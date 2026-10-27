import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { MealSessionStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../../infra/database/prisma.service'
import { NotificationService } from '../notification/notification.service'
import { PurchaseService } from '../purchase/purchase.service'
import type { CreateMealSessionDto, SaveOrderDto } from './dto/meal.dto'

const MEAL_LABEL: Record<string, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
}

/** 未确认前都可以改点菜；确认后整餐只读 */
const EDITABLE_STATUS: MealSessionStatus[] = ['not_started', 'ordering']

export interface MealOrderItemView {
  id: string
  recipeId: string
  name: string
  quantity: number
  isShared: boolean
  note: string | null
}

export interface PersonalOrderView {
  userId: string
  memberName: string
  status: string
  note: string | null
  submittedAt: string | null
  items: MealOrderItemView[]
}

export interface MealSessionView {
  id: string
  mealDate: string
  mealType: string
  label: string
  seq: number
  status: string
  myOrderStatus: string | null
  memberCount: number
  submittedCount: number
  itemCount: number
}

export interface MealSessionDetailView {
  session: MealSessionView
  myOrder: PersonalOrderView | null
  orders: PersonalOrderView[]
  totals: Array<{ recipeId: string; name: string; quantity: number }>
  isOwner: boolean
  canEdit: boolean
  canConfirm: boolean
}

const sessionInclude = {
  personalOrders: { include: { items: true, user: true } },
} satisfies Prisma.MealSessionInclude

type SessionWithOrders = Prisma.MealSessionGetPayload<{ include: typeof sessionInclude }>

export interface CalendarDayView {
  date: string
  sessions: Array<{ id: string; mealType: string; label: string; status: string }>
  served: boolean
  hasOrder: boolean
}

@Injectable()
export class MealService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly purchase: PurchaseService,
  ) {}

  async listByDate(userId: string, date: string): Promise<MealSessionView[]> {
    const { householdId } = await this.requireMembership(userId)
    const mealDate = parseDate(date)
    const sessions = await this.prisma.mealSession.findMany({
      where: { householdId, mealDate },
      include: sessionInclude,
      orderBy: [{ mealType: 'asc' }, { seq: 'asc' }],
    })
    return sessions.map((session) => this.toView(session, userId))
  }

  /** 月历：按月返回每日餐次状态，供日历页渲染 */
  async calendar(userId: string, month: string): Promise<{ month: string; days: CalendarDayView[] }> {
    const { householdId } = await this.requireMembership(userId)
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('月份格式应为 YYYY-MM')
    }
    const from = new Date(`${month}-01T00:00:00.000Z`)
    if (Number.isNaN(from.getTime())) {
      throw new BadRequestException('月份格式应为 YYYY-MM')
    }
    const next = new Date(from)
    next.setUTCMonth(next.getUTCMonth() + 1)
    const to = new Date(next.getTime() - 86400000)

    const sessions = await this.prisma.mealSession.findMany({
      where: { householdId, mealDate: { gte: from, lte: to } },
      select: {
        id: true,
        mealDate: true,
        mealType: true,
        status: true,
        personalOrders: { select: { status: true } },
      },
      orderBy: [{ mealDate: 'asc' }, { mealType: 'asc' }, { seq: 'asc' }],
    })

    const map = new Map<string, CalendarDayView>()
    for (const session of sessions) {
      const date = session.mealDate.toISOString().slice(0, 10)
      const day = map.get(date) ?? { date, sessions: [], served: false, hasOrder: false }
      day.sessions.push({
        id: session.id,
        mealType: session.mealType,
        label: MEAL_LABEL[session.mealType] ?? session.mealType,
        status: session.status,
      })
      if (session.status === 'served') {
        day.served = true
      }
      if (session.personalOrders.some((order) => order.status !== 'draft')) {
        day.hasOrder = true
      }
      map.set(date, day)
    }

    return { month, days: Array.from(map.values()) }
  }

  /** 早/中/晚固定 seq=0，加餐自动递增 */
  async createOrGet(userId: string, dto: CreateMealSessionDto): Promise<MealSessionView> {
    const { householdId } = await this.requireMembership(userId)
    const mealDate = parseDate(dto.mealDate)

    // 加餐实例可以反复创建，先尝试复用最近一个还没有人提交的空加餐
    if (dto.mealType === 'snack') {
      const reusable = await this.prisma.mealSession.findFirst({
        where: {
          householdId,
          mealDate,
          mealType: 'snack',
          status: { in: EDITABLE_STATUS },
          personalOrders: { every: { status: { in: ['draft', 'cancelled'] } } },
        },
        orderBy: { seq: 'desc' },
        include: sessionInclude,
      })
      if (reusable) {
        return this.toView(reusable, userId)
      }
    }

    let seq = 0
    if (dto.mealType === 'snack') {
      const lastSnack = await this.prisma.mealSession.findFirst({
        where: { householdId, mealDate, mealType: 'snack' },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      })
      seq = (lastSnack?.seq ?? 0) + 1
    }

    const session = await this.prisma.mealSession.upsert({
      where: {
        householdId_mealDate_mealType_seq: {
          householdId,
          mealDate,
          mealType: dto.mealType,
          seq,
        },
      },
      update: {},
      create: { householdId, mealDate, mealType: dto.mealType, seq },
      include: sessionInclude,
    })
    return this.toView(session, userId)
  }

  async detail(userId: string, sessionId: string): Promise<MealSessionDetailView> {
    const { householdId, role } = await this.requireMembership(userId)
    const session = await this.prisma.mealSession.findFirst({
      where: { id: sessionId, householdId },
      include: sessionInclude,
    })
    if (!session) {
      throw new NotFoundException('餐次不存在')
    }

    const orders = session.personalOrders.map((order) => this.toOrderView(order))
    const myOrder = orders.find((order) => order.userId === userId) ?? null
    const submittedItems = session.personalOrders
      .filter((order) => order.status === 'submitted' || order.status === 'locked')
      .flatMap((order) => order.items)

    const grouped = new Map<string, { recipeId: string; name: string; quantity: number }>()
    for (const item of submittedItems) {
      const current = grouped.get(item.recipeId)
      if (current) {
        current.quantity += item.quantity
      } else {
        grouped.set(item.recipeId, {
          recipeId: item.recipeId,
          name: item.recipeNameSnapshot,
          quantity: item.quantity,
        })
      }
    }

    const editable = EDITABLE_STATUS.includes(session.status)
    return {
      session: this.toView(session, userId),
      myOrder,
      orders,
      totals: Array.from(grouped.values()),
      isOwner: role === 'owner',
      canEdit: editable && myOrder?.status !== 'locked',
      canConfirm: role === 'owner' && editable && submittedItems.length > 0,
    }
  }

  /** 删除空餐次：只允许删除还没人提交、且未确认的餐次（典型场景是多余的加餐） */
  async remove(userId: string, sessionId: string): Promise<{ id: string }> {
    const { householdId, role } = await this.requireMembership(userId)
    const session = await this.prisma.mealSession.findFirst({
      where: { id: sessionId, householdId },
      include: { personalOrders: { select: { userId: true, status: true } } },
    })
    if (!session) {
      throw new NotFoundException('餐次不存在')
    }
    if (!EDITABLE_STATUS.includes(session.status)) {
      throw new BadRequestException('该餐次已确认，不能删除')
    }

    const blocked = session.personalOrders.some(
      (order) =>
        (order.status === 'submitted' || order.status === 'locked') && order.userId !== userId,
    )
    if (blocked && role !== 'owner') {
      throw new ForbiddenException('其他成员已提交，只有创建者可以删除')
    }
    if (session.personalOrders.some((order) => order.status === 'locked')) {
      throw new BadRequestException('点菜单已锁定，不能删除')
    }

    await this.prisma.mealSession.delete({ where: { id: sessionId } })
    return { id: sessionId }
  }

  async saveMyOrder(
    userId: string,
    sessionId: string,
    dto: SaveOrderDto,
  ): Promise<MealSessionDetailView> {
    const { householdId } = await this.requireMembership(userId)
    const session = await this.prisma.mealSession.findFirst({
      where: { id: sessionId, householdId },
      select: { id: true, status: true },
    })
    if (!session) {
      throw new NotFoundException('餐次不存在')
    }
    if (!EDITABLE_STATUS.includes(session.status)) {
      throw new ForbiddenException('该餐次已确认，不能再修改点菜')
    }

    const recipeIds = Array.from(new Set(dto.items.map((item) => item.recipeId)))
    if (recipeIds.length > 0) {
      const recipes = await this.prisma.recipe.findMany({
        where: { id: { in: recipeIds }, householdId, status: { not: 'archived' } },
        select: { id: true, name: true, version: true },
      })
      if (recipes.length !== recipeIds.length) {
        throw new BadRequestException('存在不可点的菜谱')
      }

      const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]))
      const existing = await this.prisma.personalOrder.findUnique({
        where: { mealSessionId_userId: { mealSessionId: sessionId, userId } },
        select: { id: true, status: true },
      })
      if (existing?.status === 'locked') {
        throw new ForbiddenException('点菜单已锁定')
      }

      const itemCreates = dto.items.map((item, index) => {
        const recipe = byId.get(item.recipeId)
        return {
          recipeId: item.recipeId,
          recipeVersion: recipe?.version ?? 1,
          recipeNameSnapshot: recipe?.name ?? '',
          quantity: item.quantity,
          isShared: item.isShared ?? false,
          note: item.note ?? null,
          sortOrder: index,
        }
      })

      await this.prisma.$transaction(async (tx) => {
        if (existing) {
          await tx.personalOrder.update({
            where: { id: existing.id },
            data: { note: dto.note ?? null, items: { deleteMany: {}, create: itemCreates } },
          })
        } else {
          await tx.personalOrder.create({
            data: {
              mealSessionId: sessionId,
              userId,
              note: dto.note ?? null,
              items: { create: itemCreates },
            },
          })
        }
        if (session.status === 'not_started') {
          await tx.mealSession.update({ where: { id: sessionId }, data: { status: 'ordering' } })
        }
      })
    } else {
      // 清空点菜：保留一张空草稿，避免再次进入时 404
      const existing = await this.prisma.personalOrder.findUnique({
        where: { mealSessionId_userId: { mealSessionId: sessionId, userId } },
        select: { id: true },
      })
      if (existing) {
        await this.prisma.personalOrder.update({
          where: { id: existing.id },
          data: { note: dto.note ?? null, items: { deleteMany: {} } },
        })
      } else {
        await this.prisma.personalOrder.create({
          data: { mealSessionId: sessionId, userId, note: dto.note ?? null },
        })
      }
    }

    return this.detail(userId, sessionId)
  }

  async submitMyOrder(userId: string, sessionId: string): Promise<MealSessionDetailView> {
    const { householdId } = await this.requireMembership(userId)
    const session = await this.prisma.mealSession.findFirst({
      where: { id: sessionId, householdId },
      select: { id: true, status: true },
    })
    if (!session) {
      throw new NotFoundException('餐次不存在')
    }
    if (!EDITABLE_STATUS.includes(session.status)) {
      throw new ForbiddenException('该餐次已确认，不能再提交')
    }

    const order = await this.prisma.personalOrder.findUnique({
      where: { mealSessionId_userId: { mealSessionId: sessionId, userId } },
      include: { items: true },
    })
    if (!order || order.items.length === 0) {
      throw new BadRequestException('点菜单还是空的')
    }
    if (order.status === 'locked') {
      throw new ForbiddenException('点菜单已锁定')
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.personalOrder.update({
        where: { id: order.id },
        data: { status: 'submitted', submittedAt: new Date(), version: { increment: 1 } },
      })
      if (session.status === 'not_started') {
        await tx.mealSession.update({ where: { id: sessionId }, data: { status: 'ordering' } })
      }
    })

    return this.detail(userId, sessionId)
  }

  /** 创建者确认菜单：生成汇总单与制作任务，并把已提交的点菜单锁定 */
  async confirm(userId: string, sessionId: string): Promise<MealSessionDetailView> {
    const { householdId, role } = await this.requireMembership(userId)
    if (role !== 'owner') {
      throw new ForbiddenException('只有家庭创建者可以确认菜单')
    }

    const session = await this.prisma.mealSession.findFirst({
      where: { id: sessionId, householdId },
      include: sessionInclude,
    })
    if (!session) {
      throw new NotFoundException('餐次不存在')
    }
    if (!EDITABLE_STATUS.includes(session.status)) {
      throw new BadRequestException('该餐次已确认')
    }

    const submittedOrders = session.personalOrders.filter(
      (order) => order.status === 'submitted' || order.status === 'locked',
    )
    const submittedItems = submittedOrders.flatMap((order) => order.items)
    if (submittedItems.length === 0) {
      throw new BadRequestException('还没有已提交的菜品')
    }

    const groups = new Map<
      string,
      { recipeId: string; name: string; quantity: number; sources: Array<{ itemId: string; quantity: number }> }
    >()
    for (const item of submittedItems) {
      const current = groups.get(item.recipeId)
      if (current) {
        current.quantity += item.quantity
        current.sources.push({ itemId: item.id, quantity: item.quantity })
      } else {
        groups.set(item.recipeId, {
          recipeId: item.recipeId,
          name: item.recipeNameSnapshot,
          quantity: item.quantity,
          sources: [{ itemId: item.id, quantity: item.quantity }],
        })
      }
    }

    const summary = {
      totalItems: submittedItems.reduce((sum, item) => sum + item.quantity, 0),
      dishes: Array.from(groups.values()).map((group) => ({
        recipeId: group.recipeId,
        name: group.name,
        quantity: group.quantity,
      })),
    }

    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      const aggregate = await tx.mealAggregate.create({
        data: {
          mealSessionId: sessionId,
          status: 'confirmed',
          summary: summary as Prisma.InputJsonValue,
          confirmedBy: userId,
          confirmedAt: now,
        },
      })

      await tx.productionTask.create({
        data: {
          mealAggregateId: aggregate.id,
          status: 'pending',
          items: {
            create: Array.from(groups.values()).map((group) => ({
              recipeId: group.recipeId,
              recipeNameSnapshot: group.name,
              quantity: group.quantity,
              sources: {
                create: group.sources.map((source) => ({
                  personalOrderItemId: source.itemId,
                  quantity: source.quantity,
                })),
              },
            })),
          },
        },
      })

      await tx.personalOrder.updateMany({
        where: { mealSessionId: sessionId, status: 'submitted' },
        data: { status: 'locked' },
      })

      await tx.mealSession.update({
        where: { id: sessionId },
        data: { status: 'pending_production', confirmedAt: now, confirmedBy: userId },
      })
    })

    // 确认后按食材生成采购清单，失败不阻断确认流程
    try {
      await this.purchase.generateForSession(householdId, sessionId, userId)
    } catch {
      // 忽略，可在采购清单页手动重新生成
    }

    await this.notifications.notify({
      householdId,
      dedupeId: sessionId,
      type: 'meal_confirmed',
      title: `${MEAL_LABEL[session.mealType] ?? '这一餐'}菜单已确认`,
      body: `${session.mealDate.toISOString().slice(0, 10)} 共 ${summary.totalItems} 份，制作任务已生成`,
      label: MEAL_LABEL[session.mealType] ?? '这一餐',
      detail: `共${summary.totalItems}份，任务已生成`,
      occurredAt: now,
      excludeUserId: userId,
    })

    return this.detail(userId, sessionId)
  }

  private toView(session: SessionWithOrders, userId: string): MealSessionView {
    const mine = session.personalOrders.find((order) => order.userId === userId)
    const submittedCount = session.personalOrders.filter(
      (order) => order.status === 'submitted' || order.status === 'locked',
    ).length
    return {
      id: session.id,
      mealDate: session.mealDate.toISOString().slice(0, 10),
      mealType: session.mealType,
      label: MEAL_LABEL[session.mealType] ?? session.mealType,
      seq: session.seq,
      status: session.status,
      myOrderStatus: mine?.status ?? null,
      memberCount: session.personalOrders.length,
      submittedCount,
      itemCount: session.personalOrders.reduce(
        (sum, order) => sum + order.items.reduce((inner, item) => inner + item.quantity, 0),
        0,
      ),
    }
  }

  private toOrderView(order: {
    userId: string
    status: string
    note: string | null
    submittedAt: Date | null
    items: Array<{
      id: string
      recipeId: string
      recipeNameSnapshot: string
      quantity: number
      isShared: boolean
      note: string | null
    }>
    user: { nickname: string | null }
  }): PersonalOrderView {
    return {
      userId: order.userId,
      memberName: order.user.nickname || '家人',
      status: order.status,
      note: order.note,
      submittedAt: order.submittedAt ? order.submittedAt.toISOString() : null,
      items: order.items.map((item) => ({
        id: item.id,
        recipeId: item.recipeId,
        name: item.recipeNameSnapshot,
        quantity: item.quantity,
        isShared: item.isShared,
        note: item.note,
      })),
    }
  }

  private async requireMembership(
    userId: string,
  ): Promise<{ householdId: string; role: string }> {
    const membership = await this.prisma.householdMember.findFirst({
      where: { userId, status: 'active' },
      select: { householdId: true, role: true },
    })
    if (!membership) {
      throw new NotFoundException('尚未加入家庭')
    }
    return { householdId: membership.householdId, role: membership.role }
  }
}

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('日期格式不正确')
  }
  return date
}
