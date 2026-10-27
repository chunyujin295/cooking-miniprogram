import { session } from '../../store/session'
import {
  getShoppingList,
  toggleShoppingItem,
  type ShoppingListView,
} from '../../services/shopping'

Page({
  data: {
    sessionId: '',
    view: null as ShoppingListView | null,
    readyCount: 0,
    loading: true,
    error: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ sessionId: options.sessionId ?? '' })
  },

  onShow() {
    if (!session.hasToken()) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    if (this.data.sessionId) {
      void this.load()
    }
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const view = await getShoppingList(this.data.sessionId)
      this.setData({
        view,
        readyCount: view.items.filter((item) => item.isReady).length,
        loading: false,
      })
      wx.setNavigationBarTitle({ title: `${view.label}采购清单` })
    } catch (err) {
      this.setData({ loading: false, error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  async onToggle(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    if (!this.data.view) {
      return
    }
    try {
      const { isReady } = await toggleShoppingItem(id)
      const items = this.data.view.items.map((item) =>
        item.id === id ? { ...item, isReady } : item,
      )
      this.setData({
        view: { ...this.data.view, items },
        readyCount: items.filter((item) => item.isReady).length,
      })
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '操作失败' })
    }
  },
})
