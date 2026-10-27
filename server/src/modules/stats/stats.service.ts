import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../infra/database/prisma.service'
import { MediaService } from '../media/media.service'

const MEAL_LABEL: Record<string, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
}

export interface TopDishView {
  recipeId: string
  name: string
  orderCount: number
  quantity: number
}

export interface NutritionSummaryView {
  totalKcal: number
  totalProteinG: number
  totalFatG: number
  totalCarbohydrateG: number
  dailyAvgKcal: number
  mealAvgKcal: number
  /** 有营养数据的菜谱数 / 出餐涉及的菜谱数 */
  coveredRecipes: number
  totalRecipes: number
  /** 其中尚未人工确认的估算条目 */
  unconfirmedRecipes: number
}

export interface StatsOverviewView {
  from: string
  to: string
  servedMeals: number
  servedDishes: number
  servedQuantity: number
  orderedMeals: number
  orderedDishes: number
  orderedQuantity: number
  /** 按出餐份数 × 每份能量推算；没有营养数据时为 null */
  nutrition: NutritionSummaryView | null
  topDishes: TopDishView[]
  mealTypes: Array<{ mealType: string; label: string; count: number }>
  daily: Array<{ date: string; quantity: number }>
}

export interface RandomDishView {
  id: string
  name: string
  coverUrl: string | null
  totalMinutes: number
}

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  async overview(userId: string, days: number): Promise<StatsOverviewView> {
    const { householdId } = await this.requireMembership(userId)
    const range = buildRange(days)

    const sessions = await this.prisma.mealSession.findMany({
      where: { householdId, mealDate: { gte: range.from, lte: range.to } },
      select: { id: true, mealDate: true, mealType: true, status: true },
    })
    const sessionIds = sessions.map((session) => session.id)
    const servedSessions = sessions.filter((session) => session.status === 'served')

    const servings = sessionIds.length
      ? await this.prisma.servingRecord.findMany({
          where: { mealSessionId: { in: sessionIds } },
          select: { recipeId: true, actualQuantity: true, mealSessionId: true },
        })
      : []

    const items = sessionIds.length
      ? await this.prisma.personalOrderItem.findMany({
          where: {
            personalOrder: {
              mealSessionId: { in: sessionIds },
              status: { in: ['submitted', 'locked'] },
            },
          },
          select: { recipeId: true, quantity: true, recipeNameSnapshot: true },
        })
      : []

    const orderedMeals = sessionIds.length
      ? await this.prisma.personalOrder.count({
          where: {
            mealSessionId: { in: sessionIds },
            status: { in: ['submitted', 'locked'] },
          },
        })
      : 0

    const dishMap = new Map<string, TopDishView>()
    for (const item of items) {
      const current = dishMap.get(item.recipeId)
      if (current) {
        current.orderCount += 1
        current.quantity += item.quantity
      } else {
        dishMap.set(item.recipeId, {
          recipeId: item.recipeId,
          name: item.recipeNameSnapshot,
          orderCount: 1,
          quantity: item.quantity,
        })
      }
    }

    const dailyMap = new Map<string, number>()
    const sessionDateById = new Map(
      sessions.map((session) => [session.id, session.mealDate.toISOString().slice(0, 10)]),
    )
    for (const serving of servings) {
      const date = sessionDateById.get(serving.mealSessionId)
      if (date) {
        dailyMap.set(date, (dailyMap.get(date) ?? 0) + serving.actualQuantity)
      }
    }

    const typeCount = new Map<string, number>()
    for (const session of servedSessions) {
      typeCount.set(session.mealType, (typeCount.get(session.mealType) ?? 0) + 1)
    }

    const nutrition = await this.buildNutrition(servings, servedSessions.length, days)

    return {
      from: range.from.toISOString().slice(0, 10),
      to: range.to.toISOString().slice(0, 10),
      servedMeals: servedSessions.length,
      servedDishes: servings.length,
      servedQuantity: servings.reduce((sum, item) => sum + item.actualQuantity, 0),
      orderedMeals,
      orderedDishes: items.length,
      orderedQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      nutrition,
      topDishes: Array.from(dishMap.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 8),
      mealTypes: ['breakfast', 'lunch', 'dinner', 'snack'].map((type) => ({
        mealType: type,
        label: MEAL_LABEL[type] ?? type,
        count: typeCount.get(type) ?? 0,
      })),
      daily: Array.from(dailyMap.entries())
        .map(([date, quantity]) => ({ date, quantity }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }
  }

  /** 随机抽菜：排除归档、过季时令、近 N 天已出餐的菜 */
  async random(
    userId: string,
    count: number,
    tagIds: string[],
    excludeDays: number,
  ): Promise<RandomDishView[]> {
    const { householdId } = await this.requireMembership(userId)
    const month = new Date().getMonth() + 1

    const recentFrom = new Date()
    recentFrom.setDate(recentFrom.getDate() - excludeDays)
    const recent = await this.prisma.servingRecord.findMany({
      where: {
        mealSession: {
          householdId,
          mealDate: { gte: new Date(recentFrom.toISOString().slice(0, 10)) },
        },
      },
      select: { recipeId: true },
    })
    const recentIds = new Set(recent.map((item) => item.recipeId))

    const recipes = await this.prisma.recipe.findMany({
      where: {
        householdId,
        status: 'active',
        ...(tagIds.length > 0 ? { tags: { some: { tagId: { in: tagIds } } } } : {}),
        OR: [{ seasonMonths: { isEmpty: true } }, { seasonMonths: { has: month } }],
      },
      select: {
        id: true,
        name: true,
        imageUrls: true,
        prepMinutes: true,
        cookMinutes: true,
      },
    })

    const pool = recipes.filter((recipe) => !recentIds.has(recipe.id))
    const source = pool.length > 0 ? pool : recipes

    const picked: RandomDishView[] = []
    const remaining = [...source]
    while (picked.length < count && remaining.length > 0) {
      const index = Math.floor(Math.random() * remaining.length)
      const [recipe] = remaining.splice(index, 1)
      picked.push({
        id: recipe.id,
        name: recipe.name,
        coverUrl: recipe.imageUrls[0]
          ? this.mediaService.signUrls([recipe.imageUrls[0]])[0]
          : null,
        totalMinutes: recipe.prepMinutes + recipe.cookMinutes,
      })
    }
    return picked
  }

  /**
   * 热量按「出餐份数 × 每份能量」推算，只统计有营养数据的菜谱；
   * 没有任何数据时返回 null，前端提示去菜谱页估算。
   */
  private async buildNutrition(
    servings: Array<{ recipeId: string; actualQuantity: number }>,
    servedMeals: number,
    days: number,
  ): Promise<NutritionSummaryView | null> {
    const recipeIds = Array.from(new Set(servings.map((item) => item.recipeId)))
    if (recipeIds.length === 0) {
      return null
    }
    const rows = await this.prisma.recipeNutrition.findMany({
      where: { recipeId: { in: recipeIds }, basisType: 'per_serving' },
      select: {
        recipeId: true,
        energyKcal: true,
        proteinG: true,
        fatG: true,
        carbohydrateG: true,
        isConfirmed: true,
      },
    })
    if (rows.length === 0) {
      return null
    }

    const byRecipe = new Map(rows.map((row) => [row.recipeId, row]))
    let totalKcal = 0
    let totalProteinG = 0
    let totalFatG = 0
    let totalCarbohydrateG = 0
    for (const serving of servings) {
      const row = byRecipe.get(serving.recipeId)
      if (!row) {
        continue
      }
      totalKcal += row.energyKcal * serving.actualQuantity
      totalProteinG += row.proteinG * serving.actualQuantity
      totalFatG += row.fatG * serving.actualQuantity
      totalCarbohydrateG += row.carbohydrateG * serving.actualQuantity
    }

    return {
      totalKcal: Math.round(totalKcal),
      totalProteinG: round1(totalProteinG),
      totalFatG: round1(totalFatG),
      totalCarbohydrateG: round1(totalCarbohydrateG),
      dailyAvgKcal: Math.round(totalKcal / Math.max(1, days)),
      mealAvgKcal: Math.round(totalKcal / Math.max(1, servedMeals)),
      coveredRecipes: rows.length,
      totalRecipes: recipeIds.length,
      unconfirmedRecipes: rows.filter((row) => !row.isConfirmed).length,
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

/** 以家庭时区（UTC+8）为基准取自然日，避免容器 UTC 与 meal_date 的零点偏移 */
function buildRange(days: number): { from: Date; to: Date } {
  const shifted = new Date(Date.now() + 8 * 3600 * 1000)
  const toKey = shifted.toISOString().slice(0, 10)
  shifted.setUTCDate(shifted.getUTCDate() - (days - 1))
  const fromKey = shifted.toISOString().slice(0, 10)
  return {
    from: new Date(`${fromKey}T00:00:00.000Z`),
    to: new Date(`${toKey}T00:00:00.000Z`),
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
