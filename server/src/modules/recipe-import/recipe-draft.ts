export interface DraftIngredient {
  name: string
  quantity: string
  unit: string
}

export interface DraftStep {
  content: string
}

/** 给小程序编辑页预填的草稿结构，字段与 CreateRecipeDto 对齐 */
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

const MAX_INGREDIENTS = 60
const MAX_STEPS = 40
const MAX_WARNINGS = 5
const MAX_TAGS = 5

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function int(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

/**
 * 把模型/JSON-LD 的原始输出收敛成合法草稿：
 * 截断超长字段、去掉空项、兜底数值。不可用时返回 null。
 */
export function normalizeDraft(raw: unknown): RecipeDraft | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const source = raw as Record<string, unknown>

  const name = text(source.name, 40)
  const ingredients = normalizeIngredients(source.ingredients)
  const steps = normalizeSteps(source.steps)
  if (!name || ingredients.length === 0 || steps.length === 0) {
    return null
  }

  return {
    name,
    description: text(source.description, 500),
    baseServings: int(source.baseServings, 1, 20, 2),
    prepMinutes: int(source.prepMinutes, 0, 1440, 0),
    cookMinutes: int(source.cookMinutes, 0, 1440, 0),
    seasonMonths: normalizeMonths(source.seasonMonths),
    ingredients,
    steps,
    tags: normalizeTags(source.tags),
    warnings: Array.isArray(source.warnings)
      ? source.warnings
          .map((item) => text(item, 80))
          .filter((item) => item.length > 0)
          .slice(0, MAX_WARNINGS)
      : [],
  }
}

function normalizeIngredients(raw: unknown): DraftIngredient[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const result: DraftIngredient[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const row = item as Record<string, unknown>
    const name = text(row.name, 40)
    if (!name) {
      continue
    }
    const key = `${name}|${text(row.unit, 20)}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push({ name, quantity: text(row.quantity, 20), unit: text(row.unit, 20) })
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
        ? text(item, 500)
        : item && typeof item === 'object'
          ? text((item as Record<string, unknown>).content, 500)
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
    const value = text(item, 20)
    if (value && !tags.includes(value)) {
      tags.push(value)
    }
    if (tags.length >= MAX_TAGS) {
      break
    }
  }
  return tags
}
