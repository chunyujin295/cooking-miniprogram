import { request } from './request'

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
  coveredRecipes: number
  totalRecipes: number
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

export function getStatsOverview(days: 7 | 30): Promise<StatsOverviewView> {
  return request<StatsOverviewView>({ path: `/stats/overview?days=${days}` })
}

export function pickRandomDishes(
  count = 1,
  excludeDays = 3,
  tagIds: string[] = [],
): Promise<RandomDishView[]> {
  const tagQuery = tagIds.length ? `&tagIds=${encodeURIComponent(tagIds.join(','))}` : ''
  return request<RandomDishView[]>({
    path: `/stats/random?count=${count}&excludeDays=${excludeDays}${tagQuery}`,
  })
}
