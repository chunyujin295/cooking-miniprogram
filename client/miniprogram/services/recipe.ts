import { request } from './request'
import type { NutritionView } from './nutrition'

export interface RecipeTagView {
  id: string
  name: string
}

export interface RecipeListItemView {
  id: string
  name: string
  coverUrl: string | null
  totalMinutes: number
  tags: RecipeTagView[]
  isArchived: boolean
  updatedAt: string
}

export interface RecipeDetailView {
  id: string
  name: string
  description: string | null
  coverUrl: string | null
  baseServings: number
  prepMinutes: number
  cookMinutes: number
  totalMinutes: number
  seasonMonths: number[]
  imageUrls: string[]
  images: string[]
  ingredients: Array<{ name: string; quantity: string; unit: string }>
  steps: Array<{ stepNo: number; content: string; imageUrl: string | null }>
  tags: RecipeTagView[]
  tagIds: string[]
  isArchived: boolean
  updatedAt: string
  /** manual | external-ai */
  source: string
  /** AI 估算的每份营养，未估算为 null */
  nutrition: NutritionView | null
}

export function listRecipes(params?: {
  keyword?: string
  tagIds?: string[]
  includeArchived?: boolean
}): Promise<RecipeListItemView[]> {
  const parts: string[] = []
  if (params?.keyword) {
    parts.push(`keyword=${encodeURIComponent(params.keyword)}`)
  }
  if (params?.tagIds?.length) {
    parts.push(`tagIds=${encodeURIComponent(params.tagIds.join(','))}`)
  }
  if (params?.includeArchived) {
    parts.push('includeArchived=1')
  }
  const qs = parts.length ? `?${parts.join('&')}` : ''
  return request<RecipeListItemView[]>({
    path: `/recipes${qs}`,
    method: 'GET',
  })
}

export function getRecipe(id: string): Promise<RecipeDetailView> {
  return request<RecipeDetailView>({ path: `/recipes/${id}` })
}

export type CreateRecipePayload = {
  name: string
  description?: string
  baseServings: number
  prepMinutes: number
  cookMinutes: number
  seasonMonths?: number[]
  imageUrls?: string[]
  tagIds?: string[]
  ingredients: Array<{ name: string; quantity: string; unit: string }>
  steps: Array<{ content: string; imageUrl?: string }>
  source?: 'manual' | 'external-ai'
}

export function createRecipe(payload: CreateRecipePayload): Promise<RecipeDetailView> {
  return request<RecipeDetailView>({
    path: '/recipes',
    method: 'POST',
    data: payload,
  })
}

export function updateRecipe(
  id: string,
  payload: CreateRecipePayload,
): Promise<RecipeDetailView> {
  return request<RecipeDetailView>({
    path: `/recipes/${id}`,
    method: 'PUT',
    data: payload,
  })
}

export function archiveRecipe(id: string): Promise<{ id: string; isArchived: boolean }> {
  return request({ path: `/recipes/${id}/archive`, method: 'POST' })
}

export function restoreRecipe(id: string): Promise<{ id: string; isArchived: boolean }> {
  return request({ path: `/recipes/${id}/restore`, method: 'POST' })
}

export interface TagView {
  id: string
  name: string
  category: string
  recipeCount: number
}

export function listTags(): Promise<TagView[]> {
  return request<TagView[]>({ path: '/tags' })
}

export function createTag(name: string, category?: string): Promise<TagView> {
  return request<TagView>({
    path: '/tags',
    method: 'POST',
    data: { name, category },
  })
}
export { chooseAndUploadImages } from './upload'
