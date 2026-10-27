import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { LlmService } from '../../infra/llm/llm.service'
import { PrismaService } from '../../infra/database/prisma.service'
import { buildNutritionPrompt, NUTRITION_SYSTEM_PROMPT } from './nutrition.prompt'
import { toNutritionView, type NutritionConfidence, type NutritionView } from './nutrition.types'
import type { SaveNutritionDto } from './dto/save-nutrition.dto'

/** 模型返回结构不可控，按字段名逐个取值并过滤 */
type EstimateRaw = Record<string, unknown>

export interface EstimateResultView {
  nutrition: NutritionView
  warnings: string[]
  usage: { tokenIn: number; tokenOut: number }
}

@Injectable()
export class NutritionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  async get(userId: string, recipeId: string): Promise<NutritionView | null> {
    const { householdId } = await this.requireMembership(userId)
    await this.requireRecipe(householdId, recipeId)
    const row = await this.prisma.recipeNutrition.findUnique({ where: { recipeId } })
    return row ? toNutritionView(row) : null
  }

  /** 用模型估算每份营养，结果先落库为「待确认」 */
  async estimate(userId: string, recipeId: string): Promise<EstimateResultView> {
    const { householdId } = await this.requireMembership(userId)
    const recipe = await this.requireRecipe(householdId, recipeId)
    if (!this.llm.isConfigured()) {
      throw new ServiceUnavailableException('未配置大模型，暂时无法估算热量')
    }
    if (recipe.ingredients.length === 0) {
      throw new ServiceUnavailableException('这道菜还没有食材，先补充食材再估算')
    }

    const result = await this.llm.chatJSON(
      NUTRITION_SYSTEM_PROMPT,
      buildNutritionPrompt({
        name: recipe.name,
        baseServings: recipe.baseServings,
        ingredients: recipe.ingredients.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
        })),
      }),
    )

    const raw = (result.data ?? {}) as EstimateRaw
    const energyKcal = pickNumber(raw, ['energyKcal', 'energy', 'kcal', '能量', '热量'], 0, 5000)
    if (energyKcal <= 0) {
      throw new ServiceUnavailableException('这道菜的食材信息不足，AI 给不出可靠估算')
    }

    const row = await this.prisma.recipeNutrition.upsert({
      where: { recipeId },
      create: {
        recipeId,
        basisType: 'per_serving',
        basisQuantity: 1,
        energyKcal,
        proteinG: pickNumber(raw, ['proteinG', 'protein', '蛋白质'], 0, 500),
        fatG: pickNumber(raw, ['fatG', 'fat', '脂肪'], 0, 500),
        carbohydrateG: pickNumber(raw, ['carbohydrateG', 'carbohydrate', 'carbs', '碳水'], 0, 500),
        fiberG: optional(raw, ['fiberG', 'fiber', '纤维'], 500),
        sodiumMg: optional(raw, ['sodiumMg', 'sodium', '钠'], 10000),
        source: 'ai',
        confidence: parseConfidence(raw.confidence),
        isConfirmed: false,
      },
      update: {
        basisType: 'per_serving',
        basisQuantity: 1,
        energyKcal,
        proteinG: pickNumber(raw, ['proteinG', 'protein', '蛋白质'], 0, 500),
        fatG: pickNumber(raw, ['fatG', 'fat', '脂肪'], 0, 500),
        carbohydrateG: pickNumber(raw, ['carbohydrateG', 'carbohydrate', 'carbs', '碳水'], 0, 500),
        fiberG: optional(raw, ['fiberG', 'fiber', '纤维'], 500),
        sodiumMg: optional(raw, ['sodiumMg', 'sodium', '钠'], 10000),
        source: 'ai',
        confidence: parseConfidence(raw.confidence),
        isConfirmed: false,
      },
    })

    return {
      nutrition: toNutritionView(row),
      warnings: Array.isArray(raw.warnings)
        ? raw.warnings
            .map((item) => (typeof item === 'string' ? item.slice(0, 80) : ''))
            .filter((item) => item.length > 0)
            .slice(0, 3)
        : [],
      usage: { tokenIn: result.tokenIn, tokenOut: result.tokenOut },
    }
  }

  /** 保存外部 AI 模板给出的每份营养，标记来源并等待人工确认 */
  async save(userId: string, recipeId: string, dto: SaveNutritionDto): Promise<NutritionView> {
    const { householdId } = await this.requireMembership(userId)
    await this.requireRecipe(householdId, recipeId)
    const row = await this.prisma.recipeNutrition.upsert({
      where: { recipeId },
      create: {
        recipeId,
        basisType: 'per_serving',
        basisQuantity: 1,
        energyKcal: dto.energyKcal,
        proteinG: dto.proteinG,
        fatG: dto.fatG,
        carbohydrateG: dto.carbohydrateG,
        fiberG: dto.fiberG ?? null,
        sodiumMg: dto.sodiumMg ?? null,
        source: 'external-ai',
        confidence: dto.confidence ?? 'low',
        isConfirmed: false,
      },
      update: {
        basisType: 'per_serving',
        basisQuantity: 1,
        energyKcal: dto.energyKcal,
        proteinG: dto.proteinG,
        fatG: dto.fatG,
        carbohydrateG: dto.carbohydrateG,
        fiberG: dto.fiberG ?? null,
        sodiumMg: dto.sodiumMg ?? null,
        source: 'external-ai',
        confidence: dto.confidence ?? 'low',
        isConfirmed: false,
      },
    })
    return toNutritionView(row)
  }

  /** 用户核对后确认，统计页才会把它算作可信数据 */
  async confirm(userId: string, recipeId: string): Promise<NutritionView> {
    const { householdId } = await this.requireMembership(userId)
    await this.requireRecipe(householdId, recipeId)
    const existing = await this.prisma.recipeNutrition.findUnique({ where: { recipeId } })
    if (!existing) {
      throw new NotFoundException('还没有热量数据，请先估算')
    }
    const row = await this.prisma.recipeNutrition.update({
      where: { recipeId },
      data: { isConfirmed: true },
    })
    return toNutritionView(row)
  }

  private async requireRecipe(householdId: string, recipeId: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { id: recipeId, householdId },
      select: {
        id: true,
        name: true,
        baseServings: true,
        ingredients: { select: { name: true, quantity: true, unit: true } },
      },
    })
    if (!recipe) {
      throw new NotFoundException('菜谱不存在')
    }
    return recipe
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

/** 模型可能写成 "320 kcal"，统一按首个数字解析；同时兼容中英文字段名 */
function pickNumber(raw: Record<string, unknown>, keys: string[], min: number, max: number): number {
  for (const key of keys) {
    const numeric = toNumber(raw[key])
    if (numeric !== null) {
      return Math.min(max, Math.max(min, Math.round(numeric)))
    }
  }
  return 0
}

function optional(
  raw: Record<string, unknown>,
  keys: string[],
  max: number,
): number | null {
  for (const key of keys) {
    const numeric = toNumber(raw[key])
    if (numeric !== null) {
      return Math.min(max, Math.round(numeric * 10) / 10)
    }
  }
  return null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null
  }
  if (typeof value === 'string') {
    const matched = value.match(/\d+(?:\.\d+)?/)
    if (!matched) {
      return null
    }
    const numeric = Number(matched[0])
    return Number.isFinite(numeric) ? numeric : null
  }
  return null
}

function parseConfidence(value: unknown): NutritionConfidence {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low'
}
