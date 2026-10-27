export type NutritionConfidence = 'low' | 'medium' | 'high'

export interface NutritionView {
  recipeId: string
  basisType: string
  /** 每份能量（kcal），按菜谱 baseServings 计 */
  energyKcal: number
  proteinG: number
  fatG: number
  carbohydrateG: number
  fiberG: number | null
  sodiumMg: number | null
  source: string
  confidence: NutritionConfidence
  isConfirmed: boolean
  updatedAt: string
}

export interface NutritionRow {
  recipeId: string
  basisType: string
  energyKcal: number
  proteinG: number
  fatG: number
  carbohydrateG: number
  fiberG: number | null
  sodiumMg: number | null
  source: string
  confidence: string
  isConfirmed: boolean
  updatedAt: Date
}

export function toNutritionView(row: NutritionRow): NutritionView {
  return {
    recipeId: row.recipeId,
    basisType: row.basisType,
    energyKcal: row.energyKcal,
    proteinG: row.proteinG,
    fatG: row.fatG,
    carbohydrateG: row.carbohydrateG,
    fiberG: row.fiberG,
    sodiumMg: row.sodiumMg,
    source: row.source,
    confidence: normalizeConfidence(row.confidence),
    isConfirmed: row.isConfirmed,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function normalizeConfidence(value: string): NutritionConfidence {
  return value === 'high' || value === 'medium' ? value : 'low'
}
