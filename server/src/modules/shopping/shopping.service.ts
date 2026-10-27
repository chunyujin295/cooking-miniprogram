import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../infra/database/prisma.service'

export interface ShoppingItemView {
  id: string
  ingredientName: string
  quantity: string
  unit: string
  isReady: boolean
}

export interface ShoppingListView {
  id: string
  sessionId: string
  label: string
  mealDate: string
  generatedAt: string
  items: ShoppingItemView[]
}

@Injectable()
export class ShoppingService {
  constructor(private readonly prisma: PrismaService) {}

  /** 取某餐的采购清单；不存在则按已提交的点菜即时生成（幂等） */
  async bySession(userId: string, sessionId: string): Promise<ShoppingListView> {
    const { householdId } = await this.requireMembership(userId)
    const session = await this.prisma.mealSession.findFirst({
      where: { id: sessionId, householdId },
      select: { id: true, mealDate: true, mealType: true },
    })
    if (!session) {
      throw new NotFoundException('餐次不存在')
    }

    let list = await this.prisma.shoppingList.findUnique({
      where: { mealSessionId: sessionId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    })

    if (!list) {
      list = await this.generate(householdId, sessionId, userId)
    }

    return {
      id: list.id,
      sessionId,
      label: MEAL_LABEL[session.mealType] ?? session.mealType,
      mealDate: session.mealDate.toISOString().slice(0, 10),
      generatedAt: list.generatedAt.toISOString(),
      items: list.items.map((item) => ({
        id: item.id,
        ingredientName: item.ingredientName,
        quantity: item.quantity,
        unit: item.unit,
        isReady: item.isReady,
      })),
    }
  }

  /** 勾选已备/取消 */
  async toggleItem(userId: string, itemId: string): Promise<{ id: string; isReady: boolean }> {
    const { householdId } = await this.requireMembership(userId)
    const item = await this.prisma.shoppingListItem.findFirst({
      where: { id: itemId, shoppingList: { householdId } },
    })
    if (!item) {
      throw new NotFoundException('采购项不存在')
    }
    const updated = await this.prisma.shoppingListItem.update({
      where: { id: itemId },
      data: { isReady: !item.isReady },
    })
    return { id: updated.id, isReady: updated.isReady }
  }

  /**
   * 生成清单：按菜谱归并份数，食材用量按「份数 / 基础份数」缩放，
   * 同名同单位食材合并；"适量"这类非数值用量保持原样。
   */
  private async generate(householdId: string, sessionId: string, userId: string) {
    const orderItems = await this.prisma.personalOrderItem.findMany({
      where: {
        personalOrder: {
          mealSessionId: sessionId,
          status: { in: ['submitted', 'locked'] },
        },
      },
      select: { recipeId: true, quantity: true },
    })

    const recipeQuantities = new Map<string, number>()
    for (const item of orderItems) {
      recipeQuantities.set(item.recipeId, (recipeQuantities.get(item.recipeId) ?? 0) + item.quantity)
    }

    const merged = new Map<string, { name: string; quantity: number | null; unit: string }>()
    if (recipeQuantities.size > 0) {
      const recipes = await this.prisma.recipe.findMany({
        where: { id: { in: Array.from(recipeQuantities.keys()) }, householdId },
        select: {
          id: true,
          baseServings: true,
          ingredients: { select: { name: true, quantity: true, unit: true } },
        },
      })

      for (const recipe of recipes) {
        const ordered = recipeQuantities.get(recipe.id) ?? 0
        const ratio = ordered / Math.max(1, recipe.baseServings)
        for (const ingredient of recipe.ingredients) {
          const key = `${ingredient.name}|${ingredient.unit}`
          const numeric = parseQuantity(ingredient.quantity)
          const current = merged.get(key)
          if (numeric === null) {
            if (!current) {
              merged.set(key, { name: ingredient.name, quantity: null, unit: ingredient.unit })
            }
            continue
          }
          if (current) {
            current.quantity = (current.quantity ?? 0) + numeric * ratio
          } else {
            merged.set(key, {
              name: ingredient.name,
              quantity: numeric * ratio,
              unit: ingredient.unit,
            })
          }
        }
      }
    }

    const items = Array.from(merged.values())
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
      .map((item, index) => ({
        ingredientName: item.name,
        quantity: item.quantity === null ? '适量' : formatQuantity(item.quantity),
        unit: item.unit,
        sortOrder: index,
      }))

    return this.prisma.shoppingList.create({
      data: {
        householdId,
        mealSessionId: sessionId,
        generatedBy: userId,
        items: { create: items },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    })
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

/** 从 "2" / "1.5" / "半个" 中取数值，取不到返回 null */
function parseQuantity(raw: string): number | null {
  const match = raw.trim().match(/^\d+(\.\d+)?/)
  if (!match) {
    return null
  }
  const value = Number(match[0])
  return Number.isFinite(value) && value > 0 ? value : null
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${Math.round(value * 10) / 10}`
}
