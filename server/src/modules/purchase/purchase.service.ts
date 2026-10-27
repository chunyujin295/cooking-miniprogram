import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../infra/database/prisma.service'

export interface ShoppingItemView {
  id: string
  name: string
  quantity: string
  unit: string
  isReady: boolean
}

export interface ShoppingListView {
  id: string
  mealSessionId: string
  sessionLabel: string
  mealDate: string
  items: ShoppingItemView[]
  readyCount: number
}

@Injectable()
export class PurchaseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 按餐次生成采购清单：以制作任务的份数 / 菜谱基准份数换算食材用量，同名同单位合并。
   * 可重复调用（确认菜单、或手动刷新），会覆盖旧清单。
   */
  async generateForSession(
    householdId: string,
    sessionId: string,
    userId: string,
  ): Promise<ShoppingListView> {
    const session = await this.prisma.mealSession.findFirst({
      where: { id: sessionId, householdId },
      include: { aggregate: { include: { productionTasks: { include: { items: true } } } } },
    })
    if (!session) {
      throw new NotFoundException('餐次不存在')
    }

    const taskItems = session.aggregate?.productionTasks.flatMap((task) => task.items) ?? []
    const merged = new Map<string, { name: string; quantity: number; unit: string; raw?: string }>()

    if (taskItems.length > 0) {
      const recipeIds = Array.from(new Set(taskItems.map((item) => item.recipeId)))
      const recipes = await this.prisma.recipe.findMany({
        where: { id: { in: recipeIds } },
        select: { id: true, baseServings: true, ingredients: true },
      })
      const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]))

      for (const item of taskItems) {
        const recipe = recipeMap.get(item.recipeId)
        if (!recipe || recipe.ingredients.length === 0) {
          continue
        }
        const factor = recipe.baseServings > 0 ? item.quantity / recipe.baseServings : item.quantity
        for (const ingredient of recipe.ingredients) {
          const key = `${ingredient.name.trim()}|${ingredient.unit.trim()}`
          const amount = Number.parseFloat(ingredient.quantity)
          const current = merged.get(key)
          if (Number.isFinite(amount)) {
            merged.set(key, {
              name: ingredient.name.trim(),
              quantity: (current?.quantity ?? 0) + amount * factor,
              unit: ingredient.unit.trim(),
            })
          } else {
            // 用量是「适量」这类文字时不做换算，原样保留
            merged.set(key, {
              name: ingredient.name.trim(),
              quantity: 0,
              unit: ingredient.unit.trim(),
              raw: ingredient.quantity,
            })
          }
        }
      }
    }

    const list = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.shoppingList.findUnique({ where: { mealSessionId: sessionId } })
      const header = existing
        ? await tx.shoppingList.update({
            where: { id: existing.id },
            data: { generatedBy: userId, generatedAt: new Date() },
          })
        : await tx.shoppingList.create({
            data: { householdId, mealSessionId: sessionId, generatedBy: userId },
          })

      await tx.shoppingListItem.deleteMany({ where: { shoppingListId: header.id } })

      const rows = Array.from(merged.values()).map((item, index) => ({
        shoppingListId: header.id,
        ingredientName: item.name,
        quantity: item.raw ?? formatAmount(item.quantity),
        unit: item.unit,
        sortOrder: index,
      }))
      if (rows.length > 0) {
        await tx.shoppingListItem.createMany({ data: rows })
      }
      return header
    })

    return this.toView(list.id)
  }

  /** 手动重新生成入口（内部转成 generateForSession） */
  async generateForSessionByUser(userId: string, sessionId: string): Promise<ShoppingListView> {
    const { householdId } = await this.requireMembership(userId)
    return this.generateForSession(householdId, sessionId, userId)
  }

  async bySession(userId: string, sessionId: string): Promise<ShoppingListView | null> {
    const { householdId } = await this.requireMembership(userId)
    const list = await this.prisma.shoppingList.findFirst({
      where: { mealSessionId: sessionId, householdId },
      select: { id: true },
    })
    if (!list) {
      return null
    }
    return this.toView(list.id)
  }

  async toggleItem(userId: string, itemId: string, isReady: boolean): Promise<ShoppingItemView> {
    const { householdId } = await this.requireMembership(userId)
    const item = await this.prisma.shoppingListItem.findFirst({
      where: { id: itemId, shoppingList: { householdId } },
    })
    if (!item) {
      throw new NotFoundException('采购项不存在')
    }
    const updated = await this.prisma.shoppingListItem.update({
      where: { id: itemId },
      data: { isReady },
    })
    return {
      id: updated.id,
      name: updated.ingredientName,
      quantity: updated.quantity,
      unit: updated.unit,
      isReady: updated.isReady,
    }
  }

  private async toView(listId: string): Promise<ShoppingListView> {
    const list = await this.prisma.shoppingList.findUniqueOrThrow({
      where: { id: listId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        mealSession: true,
      },
    })
    const items = list.items.map((item) => ({
      id: item.id,
      name: item.ingredientName,
      quantity: item.quantity,
      unit: item.unit,
      isReady: item.isReady,
    }))
    return {
      id: list.id,
      mealSessionId: list.mealSessionId,
      sessionLabel: MEAL_LABEL[list.mealSession.mealType] ?? list.mealSession.mealType,
      mealDate: list.mealSession.mealDate.toISOString().slice(0, 10),
      items,
      readyCount: items.filter((item) => item.isReady).length,
    }
  }

  private async requireMembership(userId: string): Promise<{ householdId: string }> {
    const membership = await this.prisma.householdMember.findFirst({
      where: { userId, status: 'active' },
      select: { householdId: true },
    })
    if (!membership) {
      throw new NotFoundException('尚未加入家庭')
    }
    return { householdId: membership.householdId }
  }
}

const MEAL_LABEL: Record<string, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
}

function formatAmount(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return `${rounded}`
}
