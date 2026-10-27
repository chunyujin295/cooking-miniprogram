/** 线上后端：经 codis.fun 路径前缀反代到家庭主机 */
export const BASE_URL: string = 'https://codis.fun/cooking/api/v1'

/**
 * 本地联调用地址。需要时把 BASE_URL 换成它，
 * 并在开发者工具「详情 → 本地设置」勾选「不校验合法域名」。
 */
export const DEV_BASE_URL: string = 'http://127.0.0.1:3000/api/v1'