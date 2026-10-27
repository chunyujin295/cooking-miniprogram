import { request } from './request'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface MealSessionView {
  id: string
  mealDate: string
  mealType: MealType
  label: string
  seq: number
  status: string
  myOrderStatus: string | null
  memberCount: number
  submittedCount: number
  itemCount: number
}

export interface MealOrderItemView {
  id: string
  recipeId: string
  name: string
  quantity: number
  isShared: boolean
  note: string | null
}

export interface PersonalOrderView {
  userId: string
  memberName: string
  status: string
  note: string | null
  submittedAt: string | null
  items: MealOrderItemView[]
}

export interface MealSessionDetailView {
  session: MealSessionView
  myOrder: PersonalOrderView | null
  orders: PersonalOrderView[]
  totals: Array<{ recipeId: string; name: string; quantity: number }>
  isOwner: boolean
  canEdit: boolean
  canConfirm: boolean
}

export function listMealSessions(date: string): Promise<MealSessionView[]> {
  return request<MealSessionView[]>({ path: `/meal-sessions?date=${encodeURIComponent(date)}` })
}

export interface CalendarDayView {
  date: string
  sessions: Array<{ id: string; mealType: MealType; label: string; status: string }>
  served: boolean
  hasOrder: boolean
}

export function getCalendar(month: string): Promise<{ month: string; days: CalendarDayView[] }> {
  return request<{ month: string; days: CalendarDayView[] }>({
    path: `/meal-sessions/calendar?month=${encodeURIComponent(month)}`,
  })
}

export function createMealSession(
  mealDate: string,
  mealType: MealType,
): Promise<MealSessionView> {
  return request<MealSessionView>({
    path: '/meal-sessions',
    method: 'POST',
    data: { mealDate, mealType },
  })
}

export function getMealSession(id: string): Promise<MealSessionDetailView> {
  return request<MealSessionDetailView>({ path: `/meal-sessions/${id}` })
}

export function saveMyOrder(
  sessionId: string,
  payload: {
    note?: string
    items: Array<{ recipeId: string; quantity: number; isShared?: boolean; note?: string }>
  },
): Promise<MealSessionDetailView> {
  return request<MealSessionDetailView>({
    path: `/meal-sessions/${sessionId}/orders/mine`,
    method: 'PUT',
    data: payload,
  })
}

export function submitMyOrder(sessionId: string): Promise<MealSessionDetailView> {
  return request<MealSessionDetailView>({
    path: `/meal-sessions/${sessionId}/orders/mine/submit`,
    method: 'POST',
  })
}

/** 删除空餐次（多余加餐），后端会校验是否已有人提交 */
export function deleteMealSession(sessionId: string): Promise<{ id: string }> {
  return request<{ id: string }>({
    path: `/meal-sessions/${sessionId}`,
    method: 'DELETE',
  })
}

export function confirmMealSession(sessionId: string): Promise<MealSessionDetailView> {
  return request<MealSessionDetailView>({
    path: `/meal-sessions/${sessionId}/confirm`,
    method: 'POST',
  })
}

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
}

export const MEAL_STATUS_LABEL: Record<string, string> = {
  not_started: '未开始',
  ordering: '点菜中',
  pending_production: '待制作',
  producing: '制作中',
  partially_served: '部分出餐',
  served: '已出餐',
  cancelled: '已取消',
}
