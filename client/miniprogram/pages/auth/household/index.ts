import { acceptInvite, createHousehold } from '../../../services/household'
import { session } from '../../../store/session'

Page({
  data: {
    mode: 'create' as 'create' | 'join',
    name: '',
    code: '',
    loading: false,
    error: '',
  },

  onModeChange(e: WechatMiniprogram.CustomEvent) {
    const mode = String(e.currentTarget.dataset.mode)
    this.setData({ mode: mode === 'join' ? 'join' : 'create', error: '' })
  },

  onInput(e: WechatMiniprogram.CustomEvent) {
    const field = String(e.currentTarget.dataset.field)
    const value = (e.detail as { value?: string }).value ?? ''
    if (field === 'name') {
      this.setData({ name: value })
    } else {
      this.setData({ code: value })
    }
  },

  async onSubmit() {
    if (this.data.loading) {
      return
    }

    const { mode, name, code } = this.data
    if (mode === 'create' && name.trim().length === 0) {
      this.setData({ error: '请填写家庭名称' })
      return
    }
    if (mode === 'join' && code.trim().length === 0) {
      this.setData({ error: '请填写邀请码' })
      return
    }

    this.setData({ loading: true, error: '' })
    try {
      const householdId =
        mode === 'create'
          ? (await createHousehold(name.trim())).id
          : (await acceptInvite(code.trim())).householdId

      session.setHouseholdId(householdId)
      wx.reLaunch({ url: '/pages/home/index' })
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '操作失败' })
    } finally {
      this.setData({ loading: false })
    }
  },
})