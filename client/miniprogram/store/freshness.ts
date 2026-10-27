/**
 * tab 页数据新鲜度：底部导航每次切换都会触发 onShow，
 * 用时间戳做一层短 TTL 缓存，避免来回切换时反复全量拉取。
 * 写操作后可以主动 invalidate，让相关页面下次进入时重新拉取。
 */
const DEFAULT_TTL = 20_000

const loadedAt: Record<string, number> = {}

export const freshness = {
  /** 从未加载或超过 TTL 视为过期 */
  stale(key: string, ttl = DEFAULT_TTL): boolean {
    const at = loadedAt[key] ?? 0
    return Date.now() - at >= ttl
  },

  /** 一次请求成功后打点 */
  touch(...keys: string[]): void {
    const now = Date.now()
    for (const key of keys) {
      loadedAt[key] = now
    }
  },

  /** 写操作后让相关页面下次 onShow 时重新拉取 */
  invalidate(...keys: string[]): void {
    for (const key of keys) {
      loadedAt[key] = 0
    }
  },
}
