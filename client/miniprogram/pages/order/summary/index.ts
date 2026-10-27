import {
  confirmMealSession,
  getMealSession,
  MEAL_STATUS_LABEL,
  type MealSessionDetailView,
} from '../../../services/meal'
import { session } from '../../../store/session'

interface OrderRow {
  userId: string
  memberName: string
  statusLabel: string
  items: Array<{ name: string; quantity: number; note: string }>
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: '未提交',
  submitted: '已提交',
  locked: '已确认',
  archived: '已归档',
  cancelled: '已取消',
}

Page({
  data: {
    id: '',
    detail: null as MealSessionDetailView | null,
    orderRows: [] as OrderRow[],
    title: '',
    statusLabel: '',
    loading: true,
    busy: false,
    error: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ id: options.id ?? '' })
  },

  onShow() {
    if (!session.hasToken()) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    if (this.data.id) {
      void this.load()
    }
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const detail = await getMealSession(this.data.id)
      const orderRows: OrderRow[] = detail.orders
        .filter((order) => order.status !== 'draft')
        .map((order) => ({
          userId: order.userId,
          memberName: order.memberName,
          statusLabel: ORDER_STATUS_LABEL[order.status] ?? order.status,
          items: order.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            note: item.note ?? '',
          })),
        }))

      this.setData({
        detail,
        orderRows,
        title: `${detail.session.label} · 汇总`,
        statusLabel: MEAL_STATUS_LABEL[detail.session.status] ?? detail.session.status,
        loading: false,
      })
      wx.setNavigationBarTitle({ title: `${detail.session.label} · 汇总` })
    } catch (err) {
      this.setData({ loading: false, error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  async onConfirm() {
    if (this.data.busy || !this.data.detail?.canConfirm) {
      return
    }
    wx.showModal({
      title: '确认菜单',
      content: '确认后将生成制作任务，所有人的点菜单会锁定。确定吗？',
      success: async (res) => {
        if (!res.confirm) {
          return
        }
        this.setData({ busy: true, error: '' })
        try {
          const detail = await confirmMealSession(this.data.id)
          this.setData({
            detail,
            statusLabel: MEAL_STATUS_LABEL[detail.session.status] ?? '',
          })
          wx.showToast({ title: '已确认，进入制作', icon: 'success' })
          await this.load()
        } catch (err) {
          this.setData({ error: err instanceof Error ? err.message : '确认失败' })
        } finally {
          this.setData({ busy: false })
        }
      },
    })
  },

  onOpenRecipe(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    wx.navigateTo({ url: `/pages/recipe/detail/index?id=${id}` })
  },

  onOpenShopping() {
    if (!this.data.detail) {
      return
    }
    wx.navigateTo({ url: `/pages/shopping/index?sessionId=${this.data.detail.session.id}` })
  },
})
