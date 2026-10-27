import { BASE_URL } from '../../config/env'
import {
  getStatsOverview,
  pickRandomDishes,
  type RandomDishView,
  type StatsOverviewView,
} from '../../services/stats'
import { session } from '../../store/session'
import { freshness } from '../../store/freshness'

interface TopRow {
  name: string
  quantity: number
  orderCount: number
  percent: number
}

interface TypeRow {
  label: string
  count: number
  percent: number
}

interface RandomRow extends RandomDishView {
  cover: string
}

Page({
  data: {
    days: 7 as 7 | 30,
    overview: null as StatsOverviewView | null,
    topRows: [] as TopRow[],
    typeRows: [] as TypeRow[],
    random: null as RandomRow | null,
    loading: true,
    picking: false,
    error: '',
  },

  onShow() {
    if (!session.hasToken()) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    if (!freshness.stale('stats')) {
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
      const overview = await getStatsOverview(this.data.days)
      const maxQty = Math.max(1, ...overview.topDishes.map((item) => item.quantity))
      const maxType = Math.max(1, ...overview.mealTypes.map((item) => item.count))
      this.setData({
        overview,
        topRows: overview.topDishes.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          orderCount: item.orderCount,
          percent: Math.round((item.quantity / maxQty) * 100),
        })),
        typeRows: overview.mealTypes.map((item) => ({
          label: item.label,
          count: item.count,
          percent: Math.round((item.count / maxType) * 100),
        })),
        loading: false,
      })
      freshness.touch('stats')
    } catch (err) {
      this.setData({ loading: false, error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  onDaysTap(e: WechatMiniprogram.TouchEvent) {
    const days = Number(e.currentTarget.dataset.days) === 30 ? 30 : 7
    if (days === this.data.days) {
      return
    }
    this.setData({ days: days as 7 | 30 }, () => {
      void this.load()
    })
  },

  async onPick() {
    if (this.data.picking) {
      return
    }
    this.setData({ picking: true, error: '' })
    try {
      const [dish] = await pickRandomDishes(1, 3)
      if (!dish) {
        this.setData({ random: null, error: '菜谱还是空的，先去添加菜谱' })
        return
      }
      this.setData({
        random: { ...dish, cover: dish.coverUrl ? `${BASE_URL}${dish.coverUrl}` : '' },
      })
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '抽菜失败' })
    } finally {
      this.setData({ picking: false })
    }
  },

  onOpenRandom() {
    if (!this.data.random) {
      return
    }
    wx.navigateTo({ url: `/pages/recipe/detail/index?id=${this.data.random.id}` })
  },

  onGoOrder() {
    wx.switchTab({ url: '/pages/order/index' })
  },
})
