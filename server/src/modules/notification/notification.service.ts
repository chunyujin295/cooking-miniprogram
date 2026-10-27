import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../infra/database/prisma.service'
import { WechatService } from '../../infra/wechat/wechat.service'
import { loadConfig } from '../../config/env'

export interface NotificationItemView {
  id: string
  type: string
  title: string
  body: string
  createdAt: string
  readAt: string | null
}

export interface NotificationListView {
  unread: number
  items: NotificationItemView[]
}

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wechat: WechatService,
  ) {}

  /**
   * 站内通知 + 订阅消息尝试。
   * 未配置模板或发送失败时状态为 skipped/failed，绝不标成 sent。
   */
  async notify(input: {
    householdId: string
    dedupeId: string
    type: string
    title: string
    body: string
    /** 餐次名，如 晚餐 / 加餐 */
    label: string
    /** 模板里的内容字段，如 共 3 份、制作任务已生成 */
    detail: string
    /** 接单人昵称，仅接单通知使用 */
    operator?: string
    occurredAt?: Date
    excludeUserId?: string
  }): Promise<void> {
    const members = await this.prisma.householdMember.findMany({
      where: { householdId: input.householdId, status: 'active' },
      include: { user: true },
    })
    const targets = members.filter((member) => member.userId !== input.excludeUserId)
    if (targets.length === 0) {
      return
    }

    const rows = targets.map((member) => ({
      householdId: input.householdId,
      userId: member.userId,
      type: input.type,
      payload: { title: input.title, body: input.body },
      dedupeKey: `${input.type}:${input.dedupeId}:${member.userId}`,
      status: 'pending' as const,
    }))
    await this.prisma.notification.createMany({ data: rows, skipDuplicates: true })

    const created = await this.prisma.notification.findMany({
      where: { dedupeKey: { in: rows.map((row) => row.dedupeKey) } },
      include: { user: true },
    })

    for (const row of created) {
      if (row.status !== 'pending') {
        continue
      }
      const templateId = this.templateFor(row.type)
      if (!templateId) {
        await this.prisma.notification.update({
          where: { id: row.id },
          data: { status: 'skipped' },
        })
        continue
      }
      try {
        await this.wechat.sendSubscribeMessage(
          row.user.openid,
          templateId,
          '/pages/notification/index',
          buildTemplateData(input),
        )
        await this.prisma.notification.update({
          where: { id: row.id },
          data: { status: 'sent', sentAt: new Date() },
        })
      } catch {
        await this.prisma.notification.update({
          where: { id: row.id },
          data: { status: 'failed' },
        })
      }
    }
  }

  async listMine(userId: string): Promise<NotificationListView> {
    const items = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const unread = await this.prisma.notification.count({
      where: { userId, readAt: null },
    })
    return {
      unread,
      items: items.map((item) => {
        const payload = (item.payload ?? {}) as { title?: string; body?: string }
        return {
          id: item.id,
          type: item.type,
          title: payload.title ?? '通知',
          body: payload.body ?? '',
          createdAt: item.createdAt.toISOString(),
          readAt: item.readAt ? item.readAt.toISOString() : null,
        }
      }),
    }
  }

  async unreadCount(userId: string): Promise<{ unread: number }> {
    const unread = await this.prisma.notification.count({ where: { userId, readAt: null } })
    return { unread }
  }

  async markRead(userId: string, id: string): Promise<{ id: string; readAt: string }> {
    const found = await this.prisma.notification.findFirst({ where: { id, userId } })
    if (!found) {
      throw new NotFoundException('通知不存在')
    }
    const readAt = found.readAt ?? new Date()
    await this.prisma.notification.update({
      where: { id },
      data: { readAt },
    })
    return { id, readAt: readAt.toISOString() }
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    })
    return { updated: result.count }
  }

  private templateFor(type: string): string {
    const templates = loadConfig().wechat.templates
    if (type === 'meal_confirmed') {
      return templates.mealConfirmed
    }
    if (type === 'task_accepted') {
      return templates.taskAccepted
    }
    if (type === 'meal_served') {
      return templates.mealServed
    }
    return ''
  }
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function formatDateTime(date: Date): string {
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 按微信字段限制截断：phrase 5 字、thing 20 字 */
function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

/**
 * 三张模板的字段对应关系：
 * - meal_confirmed：新订单通知（phrase1 订单类型 / thing8 服务简介 / date4 提交时间）
 * - task_accepted：服务人员接单通知（thing2 服务名称 / thing3 服务人员 / time5 接单时间）
 * - meal_served：订单完成通知（thing12 订单类型 / thing16 备注 / time5 结束时间）
 */
function buildTemplateData(input: {
  type: string
  label: string
  detail: string
  operator?: string
  occurredAt?: Date
}): Record<string, { value: string }> {
  const at = input.occurredAt ?? new Date()
  if (input.type === 'meal_confirmed') {
    return {
      phrase1: { value: clip(input.label, 5) },
      thing8: { value: clip(input.detail, 20) },
      date4: { value: formatDate(at) },
    }
  }
  if (input.type === 'task_accepted') {
    return {
      thing2: { value: clip(input.label, 20) },
      thing3: { value: clip(input.operator ?? '家人', 20) },
      time5: { value: formatDateTime(at) },
    }
  }
  return {
    thing12: { value: clip(input.label, 20) },
    thing16: { value: clip(input.detail, 20) },
    time5: { value: formatDateTime(at) },
  }
}
