import { getSubscribeTemplateIds } from '../../../services/account'
import { wechatLogin } from '../../../services/auth'
import { session } from '../../../store/session'

Page({
  data: {
    loading: false,
    error: '',
    templateIds: [] as string[],
  },

  onLoad() {
    void this.prefetchTemplates()
  },

  /**
   * 订阅消息授权必须发生在用户点击事件的同步调用栈里，
   * 所以在登录前先弹授权框，授权完成后再继续登录。
   */
  onLogin() {
    if (this.data.loading) {
      return
    }

    if (this.data.templateIds.length === 0 || isDevtools()) {
      // 开发者工具的订阅弹窗经常不可见却拦截点击，直接跳过授权
      void this.doLogin()
      return
    }

    let proceeded = false
    const proceed = () => {
      if (proceeded) {
        return
      }
      proceeded = true
      void this.doLogin()
    }

    // 开发者工具里订阅弹窗偶尔不显示也不回调，2.5 秒兜底继续登录
    setTimeout(proceed, 2500)
    try {
      wx.requestSubscribeMessage({
        tmplIds: this.data.templateIds.slice(0, 3),
        success: (res) => {
          console.log('[subscribe] result', res)
        },
        fail: (err) => {
          console.warn('[subscribe] failed', err)
        },
        complete: proceed,
      })
    } catch (err) {
      console.warn('[subscribe] threw', err)
      proceed()
    }
  },

  async doLogin() {
    this.setData({ loading: true, error: '' })
    try {
      const loginRes = await wx.login()
      if (!loginRes.code) {
        throw new Error('未获取到微信登录凭证')
      }

      const result = await wechatLogin(loginRes.code)
      session.setToken(result.token)

      if (result.householdId) {
        session.setHouseholdId(result.householdId)
        wx.reLaunch({ url: '/pages/home/index' })
      } else {
        wx.redirectTo({ url: '/pages/auth/household/index' })
      }
    } catch (err) {
      this.setData({ error: err instanceof Error ? err.message : '登录失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async prefetchTemplates() {
    try {
      const { templateIds } = await getSubscribeTemplateIds()
      this.setData({ templateIds })
    } catch {
      // 拿不到模板就不弹授权，站内通知仍可用
    }
  },
})

function isDevtools(): boolean {
  try {
    return wx.getDeviceInfo().platform === 'devtools'
  } catch {
    return false
  }
}
