import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItemView,
} from '../../services/notification'
import { session } from '../../store/session'

interface Row extends NotificationItemView {
  timeText: string
}

Page({
  data: {
    items: [] as Row[],
    unread: 0,
    loading: true,
    error: '',
  },

  onShow() {
    if (!session.hasToken()) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    void this.load()
  },

  async onPullDownRefresh() {
    await this.load()
    wx.stopPullDownRefresh()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const view = await listNotifications()
      this.setData({
        items: view.items.map((item) => ({ ...item, timeText: formatTime(item.createdAt) })),
        unread: view.unread,
        loading: false,
      })
    } catch (err) {
      this.setData({ loading: false, error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  async onTapItem(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    const target = this.data.items.find((item) => item.id === id)
    if (target && !target.readAt) {
      try {
        await markNotificationRead(id)
        this.setData({
          items: this.data.items.map((item) =>
            item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
          ),
          unread: Math.max(0, this.data.unread - 1),
        })
      } catch {
        // 已读失败不影响查看
      }
    }
  },

  async onReadAll() {
    if (this.data.unread === 0) {
      return
    }
    try {
      await markAllNotificationsRead()
      await this.load()
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '操作失败' })
    }
  },
})

function formatTime(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`
}
