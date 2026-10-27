import { ApiError } from '../../services/request'
import { BASE_URL } from '../../config/env'
import { getProfile } from '../../services/account'
import { getUnreadCount } from '../../services/notification'
import { createInvite, getCurrentHousehold } from '../../services/household'
import {
  listMealSessions,
  MEAL_STATUS_LABEL,
  type MealSessionView,
} from '../../services/meal'
import { session } from '../../store/session'
import { toDateKey } from '../../utils/date'

interface MemberItem {
  userId: string
  name: string
  initial: string
  avatar: string
  role: string
}

interface MealItem extends MealSessionView {
  statusText: string
}

Page({
  data: {
    householdName: '',
    members: [] as MemberItem[],
    inviteCode: '',
    meals: [] as MealItem[],
    myName: '未设置昵称',
    myAvatar: '',
    unread: 0,
    loading: true,
    error: '',
  },

  async onShow() {
    if (!session.hasToken()) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }

    this.setData({ loading: true, error: '' })
    try {
      const [view, sessions, profile, unread] = await Promise.all([
        getCurrentHousehold(),
        listMealSessions(toDateKey()).catch(() => [] as MealSessionView[]),
        getProfile().catch(() => null),
        getUnreadCount().catch(() => ({ unread: 0 })),
      ])
      this.setData({
        householdName: view.household.name,
        myName: profile?.nickname || '未设置昵称',
        myAvatar: profile?.avatarUrl ? `${BASE_URL}${profile.avatarUrl}` : '',
        unread: unread.unread,
        members: view.members.map((m) => ({
          userId: m.userId,
          name: m.nickname || '家人',
          initial: (m.nickname || '家').slice(0, 1),
          avatar: m.avatarUrl ? `${BASE_URL}${m.avatarUrl}` : '',
          role: m.role === 'owner' ? '创建者' : '成员',
        })),
        meals: sessions.map((item) => ({
          ...item,
          statusText: MEAL_STATUS_LABEL[item.status] ?? item.status,
        })),
        loading: false,
      })
    } catch (err) {
      this.setData({ loading: false })
      if (err instanceof ApiError && err.code === 404) {
        wx.redirectTo({ url: '/pages/auth/household/index' })
        return
      }
      this.setData({ error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  async onCreateInvite() {
    this.setData({ error: '' })
    try {
      const { code } = await createInvite()
      this.setData({ inviteCode: code })
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '生成邀请码失败' })
    }
  },

  onCopyInvite() {
    if (!this.data.inviteCode) {
      return
    }
    wx.setClipboardData({ data: this.data.inviteCode })
  },

  onOpenCalendar() {
    wx.navigateTo({ url: '/pages/calendar/index' })
  },

  onProfile() {
    wx.navigateTo({ url: '/pages/profile/index' })
  },

  onNotifications() {
    wx.navigateTo({ url: '/pages/notification/index' })
  },
})