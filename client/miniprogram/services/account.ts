import { request } from './request'

export interface ProfileView {
  id: string
  nickname: string | null
  avatarKey: string | null
  avatarUrl: string | null
}

export function getProfile(): Promise<ProfileView> {
  return request<ProfileView>({ path: '/auth/me' })
}

export function updateProfile(payload: {
  nickname?: string
  avatarKey?: string
}): Promise<ProfileView> {
  return request<ProfileView>({
    path: '/auth/profile',
    method: 'PUT',
    data: payload,
  })
}

export function getSubscribeTemplateIds(): Promise<{ templateIds: string[] }> {
  // 登录页在无 token 时也会调用，不能触发 401 跳转
  return request<{ templateIds: string[] }>({
    path: '/notifications/config',
    skipAuthRedirect: true,
  })
}
