import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../infra/database/prisma.service'
import { NotificationService } from '../notification/notification.service'

const ACTIVE_STATUSES = ['pending', 'accepted', 'producing', 'partially_completed'] as const

const taskInclude = {
  assignee: true,
  mealAggregate: { include: { mealSession: true } },
  items: {
    orderBy: { recipeNameSnapshot: 'asc' },
    include: {
      sources: {
        include: {
          personalOrderItem: {
            include: { personalOrder: { include: { user: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.ProductionTaskInclude

type TaskWithDetail = Prisma.ProductionTaskGetPayload<{ include: typeof taskInclude }>

export interface TaskItemView {
  id: string
  recipeId: string
  name: string
  quantity: number
  status: string
  completedAt: string | null
  completedByName: string | null
  sources: Array<{ memberName: string; quantity: number }>
}

export interface ProductionTaskView {
  id: string
  sessionId: string
  mealDate: string
  mealType: string
  label: string
  sessionStatus: string
  status: string
  assigneeUserId: string | null
  assigneeName: string | null
  totalQuantity: number
  completedCount: number
  canAccept: boolean
  canStart: boolean
  canServe: boolean
  items: TaskItemView[]
}

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async list(
    userId: string,
    scope: 'active' | 'all' = 'active',
  ): Promise<ProductionTaskView[]> {
    const { householdId } = await this.requireMembership(userId)
    const tasks = await this.prisma.productionTask.findMany({
      where: {
        mealAggregate: { mealSession: { householdId } },
        ...(scope === 'active' ? { status: { in: [...ACTIVE_STATUSES] } } : {}),
      },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const names = await this.resolveUserNames(tasks)
    return tasks.map((task) => this.toView(task, userId, names))
  }

  /** 认领：条件更新防止并发重复接单 */
  async accept(userId: string, taskId: string): Promise<ProductionTaskView> {
    const { householdId } = await this.requireMembership(userId)
    const task = await this.requireTask(householdId, taskId)
    if (task.status !== 'pending' || task.assigneeUserId) {
      throw new ConflictException('任务已被认领')
    }

    const now = new Date()
    const updated = await this.prisma.productionTask.updateMany({
      where: { id: taskId, assigneeUserId: null, status: 'pending' },
      data: {
        assigneeUserId: userId,
        status: 'accepted',
        acceptedAt: now,
        version: { increment: 1 },
      },
    })
    if (updated.count === 0) {
      throw new ConflictException('任务已被认领')
    }

    await this.prisma.mealSession.update({
      where: { id: task.mealAggregate.mealSessionId },
      data: { status: 'producing' },
    })

    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nickname: true },
    })
    await this.notifications.notify({
      householdId,
      dedupeId: taskId,
      type: 'task_accepted',
      title: `${MEAL_LABEL[task.mealAggregate.mealSession.mealType] ?? '这一餐'}已有人接单`,
      body: `${me?.nickname || '家人'} 接单，共 ${task.items.reduce((s, i) => s + i.quantity, 0)} 份`,
      label: MEAL_LABEL[task.mealAggregate.mealSession.mealType] ?? '这一餐',
      detail: `共${task.items.reduce((s, i) => s + i.quantity, 0)}份`,
      operator: me?.nickname || '家人',
      occurredAt: now,
      excludeUserId: userId,
    })

    return this.detail(userId, taskId)
  }

  async start(userId: string, taskId: string): Promise<ProductionTaskView> {
    const { householdId } = await this.requireMembership(userId)
    const task = await this.requireTask(householdId, taskId)
    if (task.assigneeUserId !== userId) {
      throw new ForbiddenException('只有接单人可以开始制作')
    }
    if (task.status !== 'accepted') {
      throw new BadRequestException('任务不在待开始状态')
    }

    await this.prisma.productionTask.update({
      where: { id: taskId },
      data: { status: 'producing', startedAt: new Date(), version: { increment: 1 } },
    })
    return this.detail(userId, taskId)
  }

  /** 逐道菜完成：记录时间与操作人，其余成员可协助 */
  async completeItem(
    userId: string,
    taskId: string,
    itemId: string,
  ): Promise<ProductionTaskView> {
    const { householdId } = await this.requireMembership(userId)
    const task = await this.requireTask(householdId, taskId)
    const item = task.items.find((row) => row.id === itemId)
    if (!item) {
      throw new NotFoundException('制作明细不存在')
    }
    if (task.status === 'completed') {
      throw new BadRequestException('任务已出餐')
    }
    if (task.status === 'pending' || task.status === 'accepted') {
      throw new BadRequestException('请先点击「开始制作」')
    }

    await this.prisma.$transaction(async (tx) => {
      if (item.status !== 'completed') {
        await tx.productionTaskItem.update({
          where: { id: itemId },
          data: { status: 'completed', completedAt: new Date(), completedBy: userId },
        })
      }
      const remaining = await tx.productionTaskItem.count({
        where: { productionTaskId: taskId, status: { not: 'completed' } },
      })
      await tx.productionTask.update({
        where: { id: taskId },
        data: {
          // 全部做完仍停在 producing，等「确认出餐」再置为 completed
          status: remaining === 0 ? 'producing' : 'partially_completed',
          version: { increment: 1 },
        },
      })
      await tx.mealSession.update({
        where: { id: task.mealAggregate.mealSessionId },
        data: { status: 'producing' },
      })
    })

    return this.detail(userId, taskId)
  }

  /** 整餐出餐：必须所有菜品完成，落出餐记录 */
  async serve(userId: string, taskId: string): Promise<ProductionTaskView> {
    const { householdId, role } = await this.requireMembership(userId)
    const task = await this.requireTask(householdId, taskId)
    if (task.assigneeUserId && task.assigneeUserId !== userId && role !== 'owner') {
      throw new ForbiddenException('只有接单人或创建者可以确认出餐')
    }
    const unfinished = task.items.filter((item) => item.status !== 'completed')
    if (unfinished.length > 0) {
      throw new BadRequestException(`还有 ${unfinished.length} 道菜未完成`)
    }

    const sessionId = task.mealAggregate.mealSessionId
    const now = new Date()

    await this.prisma.$transaction(async (tx) => {
      for (const item of task.items) {
        await tx.servingRecord.create({
          data: {
            mealSessionId: sessionId,
            productionTaskId: taskId,
            recipeId: item.recipeId,
            plannedQuantity: item.quantity,
            actualQuantity: item.quantity,
            servedAt: now,
            recordedBy: userId,
          },
        })
      }

      await tx.productionTask.update({
        where: { id: taskId },
        data: { status: 'completed', completedAt: now, version: { increment: 1 } },
      })
      await tx.mealAggregate.update({
        where: { id: task.mealAggregateId },
        data: { status: 'served' },
      })
      await tx.mealSession.update({
        where: { id: sessionId },
        data: { status: 'served' },
      })
    })

    await this.notifications.notify({
      householdId,
      dedupeId: `${taskId}:served`,
      type: 'meal_served',
      title: `${MEAL_LABEL[task.mealAggregate.mealSession.mealType] ?? '这一餐'}出餐了`,
      body: `${task.mealAggregate.mealSession.mealDate.toISOString().slice(0, 10)} 共 ${task.items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      )} 份已出餐`,
      label: MEAL_LABEL[task.mealAggregate.mealSession.mealType] ?? '这一餐',
      detail: `共${task.items.reduce((sum, item) => sum + item.quantity, 0)}份已出餐`,
      occurredAt: now,
      excludeUserId: userId,
    })

    return this.detail(userId, taskId)
  }

  async detail(userId: string, taskId: string): Promise<ProductionTaskView> {
    const { householdId } = await this.requireMembership(userId)
    const task = await this.prisma.productionTask.findFirst({
      where: { id: taskId, mealAggregate: { mealSession: { householdId } } },
      include: taskInclude,
    })
    if (!task) {
      throw new NotFoundException('任务不存在')
    }
    const names = await this.resolveUserNames([task])
    return this.toView(task, userId, names)
  }

  private toView(
    task: TaskWithDetail,
    userId: string,
    names: Map<string, string>,
  ): ProductionTaskView {
    const totalQuantity = task.items.reduce((sum, item) => sum + item.quantity, 0)
    const completedCount = task.items.filter((item) => item.status === 'completed').length
    const allCompleted = completedCount === task.items.length && task.items.length > 0
    const session = task.mealAggregate.mealSession

    return {
      id: task.id,
      sessionId: session.id,
      mealDate: session.mealDate.toISOString().slice(0, 10),
      mealType: session.mealType,
      label: MEAL_LABEL[session.mealType] ?? session.mealType,
      sessionStatus: session.status,
      status: task.status,
      assigneeUserId: task.assigneeUserId,
      assigneeName: task.assignee ? (task.assignee.nickname || '家人') : null,
      totalQuantity,
      completedCount,
      canAccept: task.status === 'pending' && !task.assigneeUserId,
      canStart: task.assigneeUserId === userId && task.status === 'accepted',
      canServe:
        allCompleted &&
        task.status !== 'completed' &&
        (!task.assigneeUserId || task.assigneeUserId === userId),
      items: task.items.map((item) => ({
        id: item.id,
        recipeId: item.recipeId,
        name: item.recipeNameSnapshot,
        quantity: item.quantity,
        status: item.status,
        completedAt: item.completedAt ? item.completedAt.toISOString() : null,
        completedByName: item.completedBy ? (names.get(item.completedBy) ?? '成员') : null,
        sources: item.sources.map((source) => ({
          memberName: source.personalOrderItem.personalOrder.user.nickname || '家人',
          quantity: source.quantity,
        })),
      })),
    }
  }

  private async requireTask(householdId: string, taskId: string): Promise<TaskWithDetail> {
    const task = await this.prisma.productionTask.findFirst({
      where: { id: taskId, mealAggregate: { mealSession: { householdId } } },
      include: taskInclude,
    })
    if (!task) {
      throw new NotFoundException('任务不存在')
    }
    return task
  }

  private async resolveUserNames(tasks: TaskWithDetail[]): Promise<Map<string, string>> {
    const ids = Array.from(
      new Set(
        tasks
          .flatMap((task) => task.items.map((item) => item.completedBy))
          .filter((value): value is string => Boolean(value)),
      ),
    )
    if (ids.length === 0) {
      return new Map()
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, nickname: true },
    })
    return new Map(users.map((user) => [user.id, user.nickname || '家人']))
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

const MEAL_LABEL: Record<string, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
}
