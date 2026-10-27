import { request } from './request'

export interface NotificationItemView {
  id: string
  type: string
  title: string
  body: string
  createdAt: string
  readAt: string | null
}

export interface NotificationListView {
  unread: number
  items: NotificationItemView[]
}

export function listNotifications(): Promise<NotificationListView> {
  return request<NotificationListView>({ path: '/notifications' })
}

export function getUnreadCount(): Promise<{ unread: number }> {
  return request<{ unread: number }>({ path: '/notifications/unread-count' })
}

export function markNotificationRead(id: string): Promise<{ id: string; readAt: string }> {
  return request<{ id: string; readAt: string }>({
    path: `/notifications/${id}/read`,
    method: 'POST',
  })
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return request<{ updated: number }>({ path: '/notifications/read-all', method: 'POST' })
}
