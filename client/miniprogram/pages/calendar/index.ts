import {
  getCalendar,
  MEAL_STATUS_LABEL,
  type CalendarDayView,
  type MealType,
} from '../../services/meal'
import { session } from '../../store/session'
import { toDateKey } from '../../utils/date'

interface Cell {
  date: string
  day: number
  served: boolean
  hasOrder: boolean
  count: number
  isToday: boolean
  selected: boolean
}

interface SessionRow {
  id: string
  label: string
  mealType: MealType
  statusLabel: string
  served: boolean
}

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

Page({
  data: {
    month: '',
    monthLabel: '',
    weekLabels: WEEK_LABELS,
    cells: [] as Cell[],
    selectedDate: '',
    selectedLabel: '',
    daySessions: [] as SessionRow[],
    loading: true,
    error: '',
  },

  onLoad() {
    const month = toDateKey().slice(0, 7)
    this.setData({ month })
    void this.load(month)
  },

  onShow() {
    if (!session.hasToken()) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    if (this.data.month) {
      void this.load(this.data.month)
    }
  },

  async load(month: string) {
    this.setData({ loading: true, error: '' })
    try {
      const { days } = await getCalendar(month)
      const today = toDateKey()
      const dayMap = new Map<string, CalendarDayView>()
      for (const day of days) {
        dayMap.set(day.date, day)
      }

      const [year, monthNumber] = month.split('-').map(Number)
      const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay()
      const totalDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()

      const cells: Cell[] = []
      for (let i = 0; i < firstWeekday; i += 1) {
        cells.push({ date: '', day: 0, served: false, hasOrder: false, count: 0, isToday: false, selected: false })
      }
      for (let day = 1; day <= totalDays; day += 1) {
        const date = `${month}-${`${day}`.padStart(2, '0')}`
        const info = dayMap.get(date)
        cells.push({
          date,
          day,
          served: info?.served ?? false,
          hasOrder: info?.hasOrder ?? false,
          count: info?.sessions.length ?? 0,
          isToday: date === today,
          selected: false,
        })
      }

      let selectedDate = ''
      if (month === today.slice(0, 7)) {
        selectedDate = today
      } else {
        selectedDate = days.length > 0 ? days[0].date : ''
      }

      this.setData({
        month,
        monthLabel: `${year} 年 ${monthNumber} 月`,
        cells: cells.map((cell) => ({ ...cell, selected: cell.date === selectedDate })),
        selectedDate,
        selectedLabel: selectedDate,
        daySessions: buildSessionRows(dayMap.get(selectedDate)),
        loading: false,
      })
    } catch (err) {
      this.setData({ loading: false, error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  onPrev() {
    this.shiftMonth(-1)
  },

  onNext() {
    this.shiftMonth(1)
  },

  shiftMonth(delta: number) {
    const [year, monthNumber] = this.data.month.split('-').map(Number)
    const target = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
    const month = `${target.getUTCFullYear()}-${`${target.getUTCMonth() + 1}`.padStart(2, '0')}`
    void this.load(month)
  },

  onSelectDay(e: WechatMiniprogram.TouchEvent) {
    const date = e.currentTarget.dataset.date as string
    if (!date) {
      return
    }
    this.setData({
      selectedDate: date,
      selectedLabel: date,
      cells: this.data.cells.map((cell) => ({ ...cell, selected: cell.date === date })),
    })
    void this.refreshDay(date)
  },

  async refreshDay(date: string) {
    try {
      const { days } = await getCalendar(date.slice(0, 7))
      const target = days.find((day) => day.date === date)
      this.setData({ daySessions: buildSessionRows(target) })
    } catch {
      // 保留上次结果
    }
  },

  onOpenSession(e: WechatMiniprogram.TouchEvent) {
    const mealType = e.currentTarget.dataset.type as MealType
    wx.setStorageSync('orderNav', { date: this.data.selectedDate, mealType })
    wx.switchTab({ url: '/pages/order/index' })
  },

  onGoOrder() {
    wx.setStorageSync('orderNav', { date: this.data.selectedDate })
    wx.switchTab({ url: '/pages/order/index' })
  },
})

function buildSessionRows(day?: CalendarDayView): SessionRow[] {
  if (!day) {
    return []
  }
  return day.sessions.map((item) => ({
    id: item.id,
    label: item.label,
    mealType: item.mealType,
    statusLabel: MEAL_STATUS_LABEL[item.status] ?? item.status,
    served: item.status === 'served',
  }))
}
