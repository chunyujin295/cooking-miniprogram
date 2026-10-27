import { request } from './request'

export interface LoginResult {
  token: string
  user: {
    id: string
    nickname: string | null
    avatarUrl: string | null
  }
  householdId: string | null
}

export function wechatLogin(code: string): Promise<LoginResult> {
  return request<LoginResult>({
    path: '/auth/wechat-login',
    method: 'POST',
    data: { code },
    skipAuthRedirect: true,
  })
}