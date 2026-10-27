const TOKEN_KEY = 'cooking_token'
const HOUSEHOLD_KEY = 'cooking_household_id'

export const session = {
  getToken(): string {
    return wx.getStorageSync<string>(TOKEN_KEY) || ''
  },
  setToken(token: string): void {
    wx.setStorageSync(TOKEN_KEY, token)
  },
  getHouseholdId(): string {
    return wx.getStorageSync<string>(HOUSEHOLD_KEY) || ''
  },
  setHouseholdId(id: string): void {
    wx.setStorageSync(HOUSEHOLD_KEY, id)
  },
  clear(): void {
    wx.removeStorageSync(TOKEN_KEY)
    wx.removeStorageSync(HOUSEHOLD_KEY)
  },
  hasToken(): boolean {
    return session.getToken().length > 0
  },
}