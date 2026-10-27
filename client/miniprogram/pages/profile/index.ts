import { BASE_URL } from '../../config/env'
import { getProfile, getSubscribeTemplateIds, updateProfile } from '../../services/account'
import { getMyDietary, updateMyDietary } from '../../services/dietary'
import { compressAndUploadImage } from '../../services/upload'
import { session } from '../../store/session'

Page({
  data: {
    nickname: '',
    avatarKey: '',
    avatarUrl: '',
    loading: true,
    saving: false,
    uploading: false,
    templateIds: [] as string[],
    allergens: [] as string[],
    avoidances: [] as string[],
    newAllergen: '',
    newAvoidance: '',
    dietarySaving: false,
    error: '',
  },

  onShow() {
    if (!session.hasToken()) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    void this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const [profile, config, dietary] = await Promise.all([
        getProfile(),
        getSubscribeTemplateIds().catch(() => ({ templateIds: [] as string[] })),
        getMyDietary().catch(() => ({ allergens: [], avoidances: [], note: null })),
      ])
      this.setData({
        nickname: profile.nickname ?? '',
        avatarKey: profile.avatarKey ?? '',
        avatarUrl: profile.avatarUrl ? `${BASE_URL}${profile.avatarUrl}` : '',
        templateIds: config.templateIds,
        allergens: dietary.allergens,
        avoidances: dietary.avoidances,
        loading: false,
      })
    } catch (err) {
      this.setData({ loading: false, error: err instanceof Error ? err.message : '加载失败' })
    }
  },

  async onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
    const localPath = e.detail.avatarUrl
    if (!localPath || this.data.uploading) {
      return
    }
    this.setData({ uploading: true, error: '' })
    try {
      const uploaded = await compressAndUploadImage(localPath, 'avatar')
      this.setData({
        avatarKey: uploaded.key,
        avatarUrl: `${BASE_URL}${uploaded.url}`,
      })
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '头像上传失败' })
    } finally {
      this.setData({ uploading: false })
    }
  },

  onNicknameInput(e: WechatMiniprogram.Input) {
    this.setData({ nickname: e.detail.value })
  },

  /** 必须直接在点击回调里调用，才能弹出订阅授权框 */
  onEnableNotify() {
    if (this.data.templateIds.length === 0) {
      wx.showToast({ title: '暂无可用模板', icon: 'none' })
      return
    }
    try {
      if (wx.getDeviceInfo().platform === 'devtools') {
        wx.showToast({ title: '开发者工具不支持，请真机测试', icon: 'none' })
        return
      }
    } catch {
      // 忽略环境判断失败
    }
    wx.requestSubscribeMessage({
      tmplIds: this.data.templateIds.slice(0, 3),
      success: (res) => {
        const accepted = Object.keys(res).filter((key) => res[key] === 'accept')
        wx.showToast({
          title: accepted.length > 0 ? `已授权 ${accepted.length} 项` : '未授权',
          icon: 'none',
        })
      },
      fail: (err) => {
        wx.showToast({ title: err.errMsg || '授权失败', icon: 'none' })
      },
    })
  },

  onAllergenInput(e: WechatMiniprogram.Input) {
    this.setData({ newAllergen: e.detail.value })
  },

  onAddAllergen() {
    this.addDietaryItem('allergens', 'newAllergen')
  },

  onRemoveAllergen(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({ allergens: this.data.allergens.filter((_, i) => i !== index) })
  },

  onAvoidanceInput(e: WechatMiniprogram.Input) {
    this.setData({ newAvoidance: e.detail.value })
  },

  onAddAvoidance() {
    this.addDietaryItem('avoidances', 'newAvoidance')
  },

  onRemoveAvoidance(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({ avoidances: this.data.avoidances.filter((_, i) => i !== index) })
  },

  addDietaryItem(
    field: 'allergens' | 'avoidances',
    inputField: 'newAllergen' | 'newAvoidance',
  ) {
    const raw = (inputField === 'newAllergen' ? this.data.newAllergen : this.data.newAvoidance).trim()
    if (!raw) {
      return
    }
    if (raw.length > 20) {
      this.setData({ error: '单项最多 20 个字' })
      return
    }
    const list = this.data[field]
    if (list.length >= 20) {
      this.setData({ error: '最多 20 项' })
      return
    }
    if (list.includes(raw)) {
      this.setData({ [inputField]: '' } as Record<string, unknown>)
      return
    }
    this.setData({ [field]: [...list, raw], [inputField]: '' } as Record<string, unknown>)
  },

  async onSaveDietary() {
    if (this.data.dietarySaving) {
      return
    }
    this.setData({ dietarySaving: true, error: '' })
    try {
      const profile = await updateMyDietary({
        allergens: this.data.allergens,
        avoidances: this.data.avoidances,
      })
      this.setData({
        allergens: profile.allergens,
        avoidances: profile.avoidances,
      })
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '保存失败' })
    } finally {
      this.setData({ dietarySaving: false })
    }
  },

  async onSave() {
    if (this.data.saving) {
      return
    }
    const nickname = this.data.nickname.trim()
    if (!nickname) {
      this.setData({ error: '昵称不能为空' })
      return
    }
    if (nickname.length > 20) {
      this.setData({ error: '昵称最多 20 个字' })
      return
    }

    this.setData({ saving: true, error: '' })
    try {
      await updateProfile({
        nickname,
        ...(this.data.avatarKey ? { avatarKey: this.data.avatarKey } : {}),
      })
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '保存失败' })
    } finally {
      this.setData({ saving: false })
    }
  },
})
