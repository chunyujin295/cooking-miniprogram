import { BASE_URL } from '../config/env'
import { session } from '../store/session'

export interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
}

export class ApiError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

export interface RequestOptions {
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: Record<string, unknown>
  /** 登录接口本身返回 401 时，不需要再跳登录页 */
  skipAuthRedirect?: boolean
  /** 默认 15s；AI 识别这类慢接口需要放宽 */
  timeout?: number
}

/**
 * 统一请求出口。注意：小程序 wx.request 不支持 PATCH，
 * 因此服务端写接口统一使用 PUT / POST。
 */
export function request<T>(options: RequestOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const token = session.getToken()
    const header: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) {
      header.Authorization = `Bearer ${token}`
    }

    wx.request({
      url: `${BASE_URL}${options.path}`,
      method: options.method ?? 'GET',
      data: options.data,
      header,
      timeout: options.timeout ?? 15000,
      success(res) {
        const body = res.data as ApiResponse<T>

        if (res.statusCode === 401 && !options.skipAuthRedirect) {
          session.clear()
          wx.reLaunch({ url: '/pages/auth/login/index' })
          reject(new ApiError(401, '登录已失效'))
          return
        }

        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
          resolve(body.data as T)
          return
        }

        reject(new ApiError(body?.code ?? res.statusCode, body?.message ?? '请求失败'))
      },
      fail(err) {
        reject(new ApiError(-1, err.errMsg))
      },
    })
  })
}