export interface DraftItem {
  recipeId: string
  quantity: number
  note?: string
}

export interface OrderDraft {
  mealSessionId: string
  items: DraftItem[]
  note: string
}

type Listener = (draft: OrderDraft | null) => void

let current: OrderDraft | null = null
const listeners = new Set<Listener>()

/** 点菜页与清单页共享的唯一数据源，避免切页丢失已选菜品 */
export const orderDraft = {
  get(): OrderDraft | null {
    return current
  },
  set(next: OrderDraft | null) {
    current = next
    listeners.forEach((fn) => fn(next))
  },
  subscribe(fn: Listener) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}