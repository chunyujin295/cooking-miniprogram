import { request } from './request'

export interface ShoppingItemView {
  id: string
  ingredientName: string
  quantity: string
  unit: string
  isReady: boolean
}

export interface ShoppingListView {
  id: string
  sessionId: string
  label: string
  mealDate: string
  generatedAt: string
  items: ShoppingItemView[]
}

export function getShoppingList(sessionId: string): Promise<ShoppingListView> {
  return request<ShoppingListView>({ path: `/shopping-lists/by-session/${sessionId}` })
}

export function toggleShoppingItem(itemId: string): Promise<{ id: string; isReady: boolean }> {
  return request<{ id: string; isReady: boolean }>({
    path: `/shopping-lists/items/${itemId}/toggle`,
    method: 'POST',
  })
}
