import { RECIPE_PROMPT_SCHEMA_VERSION } from '../constants/recipePrompt'

export interface DraftIngredient {
  name: string
  quantity: string
  unit: string
}

export interface DraftStep {
  content: string
}

export interface NutritionDraft {
  energyKcal: number
  proteinG: number
  fatG: number
  carbohydrateG: number
  fiberG?: number
  sodiumMg?: number
  confidence?: 'low' | 'medium' | 'high'
}

export interface RecipeDraft {
  name: string
  description: string
  baseServings: number
  prepMinutes: number
  cookMinutes: number
  seasonMonths: number[]
  ingredients: DraftIngredient[]
  steps: DraftStep[]
  tags: string[]
  warnings: string[]
}

export interface ParsedImport {
  draft: RecipeDraft
  nutrition: NutritionDraft | null
}

export interface ParseResult {
  data: ParsedImport | null
  error: string
}

const MAX_INGREDIENTS = 60
const MAX_STEPS = 40
const MAX_TAGS = 5

/**
 * 解析外部 AI 按模板返回的 JSON。
 * 容错点：允许 ```json 包裹、允许前后多余解释、允许 steps 是字符串数组。
 * 返回的 error 会直接展示给用户，所以每条都要说清缺什么。
 */
export function parseRecipeJson(raw: string): ParseResult {
  const text = raw.trim()
  if (!text) {
    return { data: null, error: '还没有粘贴 AI 返回的内容' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stripFence(text))
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) {
      return { data: null, error: '没有找到 JSON，请把 AI 返回的完整内容粘贴进来' }
    }
    try {
      parsed = JSON.parse(text.slice(start, end + 1))
    } catch {
      return { data: null, error: 'JSON 格式不完整，可能被截断了，请让 AI 重新输出一次' }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { data: null, error: '返回内容不是 JSON 对象' }
  }
  const source = parsed as Record<string, unknown>
  if (source.error === 'not_recipe') {
    return { data: null, error: 'AI 判断这段内容不是菜谱，换个链接、截图或文字再试' }
  }

  const version = Number(source.schemaVersion)
  if (Number.isFinite(version) && version > RECIPE_PROMPT_SCHEMA_VERSION) {
    return { data: null, error: 'AI 按更新版本的模板输出，请先复制小程序里的最新提示词' }
  }

  const name = str(source.name, 40)
  if (!name) {
    return { data: null, error: '缺少菜名，AI 的输出里没有 name 字段' }
  }

  const ingredients = normalizeIngredients(source.ingredients)
  if (ingredients.length === 0) {
    return { data: null, error: '缺少食材，AI 的输出里 ingredients 为空或格式不对' }
  }

  const steps = normalizeSteps(source.steps)
  if (steps.length === 0) {
    return { data: null, error: '缺少步骤，AI 的输出里 steps 为空或格式不对' }
  }

  return {
    data: {
      draft: {
        name,
        description: str(source.description, 500),
        baseServings: int(source.baseServings, 1, 20, 2),
        prepMinutes: int(source.prepMinutes, 0, 1440, 0),
        cookMinutes: int(source.cookMinutes, 0, 1440, 0),
        seasonMonths: normalizeMonths(source.seasonMonths),
        ingredients,
        steps,
        tags: normalizeTags(source.tags),
        warnings: normalizeWarnings(source.warnings),
      },
      nutrition: normalizeNutrition(source.nutritionPerServing),
    },
    error: '',
  }
}

function stripFence(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
}

function normalizeIngredients(raw: unknown): DraftIngredient[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const result: DraftIngredient[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const row = item as Record<string, unknown>
    const name = str(row.name, 40)
    if (!name) {
      continue
    }
    result.push({ name, quantity: str(row.quantity, 20), unit: str(row.unit, 20) })
    if (result.length >= MAX_INGREDIENTS) {
      break
    }
  }
  return result
}

function normalizeSteps(raw: unknown): DraftStep[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const result: DraftStep[] = []
  for (const item of raw) {
    const content =
      typeof item === 'string'
        ? str(item, 500)
        : item && typeof item === 'object'
          ? str((item as Record<string, unknown>).content, 500)
          : ''
    if (!content) {
      continue
    }
    result.push({ content })
    if (result.length >= MAX_STEPS) {
      break
    }
  }
  return result
}

function normalizeMonths(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const months = raw
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 12)
  return Array.from(new Set(months)).sort((a, b) => a - b)
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const tags: string[] = []
  for (const item of raw) {
    const value = str(item, 20)
    if (value && tags.indexOf(value) < 0) {
      tags.push(value)
    }
    if (tags.length >= MAX_TAGS) {
      break
    }
  }
  return tags
}

function normalizeWarnings(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map((item) => str(item, 80))
    .filter((item) => item.length > 0)
    .slice(0, 5)
}

function normalizeNutrition(raw: unknown): NutritionDraft | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const source = raw as Record<string, unknown>
  const energyKcal = Math.round(num(source.energyKcal, 0))
  if (energyKcal <= 0) {
    return null
  }
  const confidence = source.confidence
  return {
    energyKcal: Math.min(5000, energyKcal),
    proteinG: clamp(num(source.proteinG, 0), 0, 500),
    fatG: clamp(num(source.fatG, 0), 0, 500),
    carbohydrateG: clamp(num(source.carbohydrateG, 0), 0, 500),
    ...(isNumber(source.fiberG) ? { fiberG: clamp(num(source.fiberG, 0), 0, 500) } : {}),
    ...(isNumber(source.sodiumMg) ? { sodiumMg: clamp(num(source.sodiumMg, 0), 0, 10000) } : {}),
    ...(confidence === 'low' || confidence === 'medium' || confidence === 'high'
      ? { confidence }
      : {}),
  }
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function isNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

function num(value: unknown, fallback: number): number {
  if (isNumber(value)) {
    return value as number
  }
  if (typeof value === 'string') {
    const matched = value.match(/\d+(?:\.\d+)?/)
    if (matched) {
      return Number(matched[0])
    }
  }
  return fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value * 10) / 10))
}

function int(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = num(value, Number.NaN)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.round(numeric)))
}
