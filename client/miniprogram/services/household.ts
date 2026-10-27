import { request } from './request'

export interface MemberView {
  userId: string
  nickname: string | null
  avatarUrl: string | null
  role: string
  joinedAt: string
}

export interface HouseholdView {
  household: {
    id: string
    name: string
    timezone: string
    ownerUserId: string
  }
  role: string
  members: MemberView[]
}

export function getCurrentHousehold(): Promise<HouseholdView> {
  return request<HouseholdView>({ path: '/households/current' })
}

export function createHousehold(name: string): Promise<{ id: string; name: string }> {
  return request<{ id: string; name: string }>({
    path: '/households',
    method: 'POST',
    data: { name },
  })
}

export function createInvite(): Promise<{ code: string; expiresAt: string }> {
  return request<{ code: string; expiresAt: string }>({
    path: '/households/current/invites',
    method: 'POST',
  })
}

export function acceptInvite(code: string): Promise<{ householdId: string }> {
  return request<{ householdId: string }>({
    path: '/household-invites/accept',
    method: 'POST',
    data: { code },
  })
}