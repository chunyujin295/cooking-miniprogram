export interface WechatSession {
  openid: string
  unionid?: string
}

export interface SubscribeMessageInput {
  openid: string
  templateId: string
  page?: string
  data: Record<string, unknown>
}

/** 微信能力适配器：登录、订阅消息、额度记账 */
export interface WechatAdapter {
  code2Session(code: string): Promise<WechatSession>
  sendSubscribeMessage(input: SubscribeMessageInput): Promise<void>
  /** 剩余可下发条数，额度不足时降级为站内通知 */
  remainingQuota(openid: string, templateId: string): Promise<number>
}