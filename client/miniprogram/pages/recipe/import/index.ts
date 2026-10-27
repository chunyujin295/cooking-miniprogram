import { RECIPE_PROMPT } from '../../../constants/recipePrompt'
import { session } from '../../../store/session'
import { parseRecipeJson } from '../../../utils/recipeDraft'

Page({
  data: {
    json: '',
    error: '',
    promptLength: RECIPE_PROMPT.length,
  },

  onShow() {
    if (!session.hasToken()) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
  },

  /** 提示词与 JSON 结构是配套的，只从这里的常量复制，避免用户改坏 */
  onCopyPrompt() {
    wx.setClipboardData({
      data: RECIPE_PROMPT,
      success: () => {
        wx.showToast({ title: '提示词已复制，发给 AI 即可', icon: 'none' })
      },
    })
  },

  onPasteClipboard() {
    wx.getClipboardData({
      success: (res) => {
        const value = (res.data ?? '').trim()
        if (!value) {
          wx.showToast({ title: '剪贴板是空的', icon: 'none' })
          return
        }
        this.setData({ json: value.slice(0, 20000), error: '' })
      },
    })
  },

  onJsonInput(e: WechatMiniprogram.Input) {
    this.setData({ json: e.detail.value, error: '' })
  },

  onParse() {
    const result = parseRecipeJson(this.data.json)
    if (!result.data) {
      this.setData({ error: result.error })
      return
    }

    wx.setStorageSync('recipeDraft', result.data.draft)
    if (result.data.nutrition) {
      wx.setStorageSync('recipeNutritionDraft', result.data.nutrition)
    } else {
      wx.removeStorageSync('recipeNutritionDraft')
    }
    wx.redirectTo({ url: '/pages/recipe/edit/index?fromExternal=1' })
  },

  onManual() {
    wx.redirectTo({ url: '/pages/recipe/edit/index' })
  },
})
