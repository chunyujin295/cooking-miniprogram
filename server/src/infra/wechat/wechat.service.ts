import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { loadConfig } from '../../config/env'

export interface Code2SessionResult {
  openid: string
  unionid?: string
  sessionKey: string
}

interface Code2SessionResponse {
  openid?: string
  unionid?: string
  session_key?: string
  errcode?: number
  errmsg?: string
}

@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name)
  private tokenCache: { token: string; expiresAt: number } | null = null

  async code2Session(code: string): Promise<Code2SessionResult> {
    const { appId, appSecret } = loadConfig().wechat
    if (!appId || !appSecret) {
      throw new ServiceUnavailableException('微信登录未配置')
    }

    const url =
      'https://api.weixin.qq.com/sns/jscode2session' +
      `?appid=${appId}&secret=${appSecret}` +
      `&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`

    const response = await fetch(url)
    const data = (await response.json()) as Code2SessionResponse

    if (!data.openid) {
      this.logger.warn(`code2session failed: ${data.errcode} ${data.errmsg}`)
      throw new ServiceUnavailableException(`微信登录失败（${data.errcode ?? 'unknown'}）`)
    }

    return {
      openid: data.openid,
      unionid: data.unionid,
      sessionKey: data.session_key ?? '',
    }
  }

  /**
   * 发送一次性订阅消息。用户每授权一次只能收到一条，
   * 因此模板未配置或额度耗尽时调用方应降级为站内通知。
   */
  async sendSubscribeMessage(
    openid: string,
    templateId: string,
    page: string,
    data: Record<string, { value: string }>,
  ): Promise<void> {
    const token = await this.accessToken()
    const response = await fetch(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: openid,
          template_id: templateId,
          page,
          data,
        }),
      },
    )
    const result = (await response.json()) as { errcode?: number; errmsg?: string }
    if (result.errcode !== 0) {
      this.logger.warn(`subscribe send failed: ${result.errcode} ${result.errmsg}`)
      throw new Error(`订阅消息发送失败（${result.errcode ?? 'unknown'}）`)
    }
  }

  private async accessToken(): Promise<string> {
    const { appId, appSecret } = loadConfig().wechat
    if (!appId || !appSecret) {
      throw new ServiceUnavailableException('微信未配置')
    }
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token
    }

    const response = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`,
    )
    const data = (await response.json()) as {
      access_token?: string
      expires_in?: number
      errcode?: number
      errmsg?: string
    }
    if (!data.access_token) {
      throw new ServiceUnavailableException(`获取 access_token 失败（${data.errcode ?? 'unknown'}）`)
    }

    this.tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + ((data.expires_in ?? 7200) - 300) * 1000,
    }
    return data.access_token
  }
}
