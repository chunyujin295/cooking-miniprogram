export interface NutritionEstimateInput {
  recipeName: string
  servings: number
  ingredients: Array<{ name: string; quantity: string }>
}

export interface NutritionEstimateResult {
  basisType: 'per_serving'
  energyKcal: number
  proteinG: number
  fatG: number
  carbohydrateG: number
  source: string
  confidence: 'low' | 'medium' | 'high'
}

/** AI 营养估算接口：可替换模型或服务商，结果必须经人工确认后入库 */
export interface NutritionProvider {
  estimate(input: NutritionEstimateInput): Promise<NutritionEstimateResult>
}