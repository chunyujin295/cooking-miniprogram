import { request } from './request'

export interface TaskItemView {
  id: string
  recipeId: string
  name: string
  quantity: number
  status: string
  completedAt: string | null
  completedByName: string | null
  sources: Array<{ memberName: string; quantity: number }>
}

export interface ProductionTaskView {
  id: string
  sessionId: string
  mealDate: string
  mealType: string
  label: string
  sessionStatus: string
  status: string
  assigneeUserId: string | null
  assigneeName: string | null
  totalQuantity: number
  completedCount: number
  canAccept: boolean
  canStart: boolean
  canServe: boolean
  items: TaskItemView[]
}

export const TASK_STATUS_LABEL: Record<string, string> = {
  pending: '待认领',
  accepted: '已接单',
  producing: '制作中',
  partially_completed: '部分完成',
  completed: '已完成',
  cancelled: '已取消',
  failed: '制作异常',
}

export function listProductionTasks(scope: 'active' | 'all' = 'active'): Promise<ProductionTaskView[]> {
  return request<ProductionTaskView[]>({ path: `/production/tasks?scope=${scope}` })
}

export function acceptTask(id: string): Promise<ProductionTaskView> {
  return request<ProductionTaskView>({ path: `/production/tasks/${id}/accept`, method: 'POST' })
}

export function startTask(id: string): Promise<ProductionTaskView> {
  return request<ProductionTaskView>({ path: `/production/tasks/${id}/start`, method: 'POST' })
}

export function completeTaskItem(taskId: string, itemId: string): Promise<ProductionTaskView> {
  return request<ProductionTaskView>({
    path: `/production/tasks/${taskId}/items/${itemId}/complete`,
    method: 'POST',
  })
}

export function serveTask(id: string): Promise<ProductionTaskView> {
  return request<ProductionTaskView>({ path: `/production/tasks/${id}/serve`, method: 'POST' })
}
