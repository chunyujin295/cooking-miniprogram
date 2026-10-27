import { request } from './request'

export interface NutritionView {
  recipeId: string
  basisType: string
  /** 每份能量（kcal） */
  energyKcal: number
  proteinG: number
  fatG: number
  carbohydrateG: number
  fiberG: number | null
  sodiumMg: number | null
  source: string
  confidence: 'low' | 'medium' | 'high'
  isConfirmed: boolean
  updatedAt: string
}

export interface SaveNutritionPayload {
  energyKcal: number
  proteinG: number
  fatG: number
  carbohydrateG: number
  fiberG?: number
  sodiumMg?: number
  confidence?: 'low' | 'medium' | 'high'
  /** manual：用户手动录入（直接算已确认）；不传则按模板整理处理 */
  origin?: 'manual' | 'external-ai'
}

export function getRecipeNutrition(recipeId: string): Promise<NutritionView | null> {
  return request<NutritionView | null>({ path: `/recipes/${recipeId}/nutrition` })
}

/** 保存外部 AI 模板给出的每份营养（不调用模型） */
export function saveRecipeNutrition(
  recipeId: string,
  payload: SaveNutritionPayload,
): Promise<NutritionView> {
  return request<NutritionView>({
    path: `/recipes/${recipeId}/nutrition`,
    method: 'POST',
    data: payload as unknown as Record<string, unknown>,
  })
}

export function confirmRecipeNutrition(recipeId: string): Promise<NutritionView> {
  return request<NutritionView>({
    path: `/recipes/${recipeId}/nutrition/confirm`,
    method: 'POST',
  })
}

/** 清空这道菜的营养数据 */
export function deleteRecipeNutrition(recipeId: string): Promise<{ recipeId: string }> {
  return request<{ recipeId: string }>({
    path: `/recipes/${recipeId}/nutrition`,
    method: 'DELETE',
  })
}
