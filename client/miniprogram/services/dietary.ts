import { request } from './request'

export interface DietaryProfileView {
  allergens: string[]
  avoidances: string[]
  note: string | null
}

export interface DietaryCheckItem {
  recipeId: string
  name: string
  matched: string[]
}

export function getMyDietary(): Promise<DietaryProfileView> {
  return request<DietaryProfileView>({ path: '/dietary/me' })
}

export function updateMyDietary(payload: {
  allergens?: string[]
  avoidances?: string[]
  note?: string
}): Promise<DietaryProfileView> {
  return request<DietaryProfileView>({
    path: '/dietary/me',
    method: 'PUT',
    data: payload,
  })
}

export function checkDietary(recipeIds: string[]): Promise<DietaryCheckItem[]> {
  if (recipeIds.length === 0) {
    return Promise.resolve([])
  }
  return request<DietaryCheckItem[]>({
    path: `/dietary/check?recipeIds=${encodeURIComponent(recipeIds.join(','))}`,
  })
}
