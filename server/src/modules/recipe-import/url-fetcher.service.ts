import { Injectable, Logger } from '@nestjs/common'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { DraftIngredient, DraftStep, RecipeDraft } from './recipe-draft'

export type FetchErrorCode = 'blocked_url' | 'fetch_failed' | 'no_content' | 'site_blocked'

export class FetchError extends Error {
  constructor(
    readonly code: FetchErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'FetchError'
  }
}

export interface FetchedPage {
  title: string | null
  /** JSON-LD(Recipe) 直接解析出的草稿；为空表示需要走 AI */
  draft: RecipeDraft | null
  /** 给 AI 的正文/标题文本 */
  text: string
}

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 8000
const MAX_REDIRECTS = 3
const MAX_TEXT_CHARS = 12000

/**
 * 只抓取公开的单个网页，不登录、不绕过付费墙、不下载媒体流。
 * SSRF 防护：解析域名后校验所有 IP 必须是公网地址，重定向逐跳复验。
 * 说明：DNS rebinding 的完整防护需要自定义 lookup，属于后续加固项。
 */
@Injectable()
export class UrlFetcherService {
  private readonly logger = new Logger(UrlFetcherService.name)

  async fetchPage(rawUrl: string): Promise<FetchedPage> {
    let url = normalizeUrl(rawUrl)

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await assertPublicHost(url)
      const response = await this.request(url)

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        await response.body?.cancel().catch(() => undefined)
        if (!location) {
          throw new FetchError('fetch_failed', '页面重定向缺少目标地址')
        }
        url = normalizeUrl(new URL(location, url).toString())
        continue
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (!/text\/html|application\/xhtml/i.test(contentType)) {
        await response.body?.cancel().catch(() => undefined)
        throw new FetchError('no_content', '该链接不是网页内容')
      }

      const html = await readLimited(response)
      // 人机验证页、403/429 都属于站点主动拒绝抓取，给用户同一个可操作提示
      if (isChallengePage(html)) {
        throw new FetchError('site_blocked', '目标站点有人机验证')
      }
      if (response.status === 403 || response.status === 429) {
        throw new FetchError('site_blocked', `目标站点拒绝抓取（${response.status}）`)
      }
      if (!response.ok) {
        throw new FetchError('fetch_failed', `目标页面返回 ${response.status}`)
      }
      const title = extractTitle(html)
      const draft = extractJsonLdRecipe(html)
      if (draft) {
        this.logger.log(`JSON-LD 命中：${draft.name}`)
        return { title, draft, text: '' }
      }
      const body = htmlToText(html).slice(0, MAX_TEXT_CHARS)
      if (body.length < 40) {
        throw new FetchError('no_content', '页面正文过少，可能由脚本动态渲染')
      }
      return { title, draft: null, text: `${title ? `标题：${title}\n` : ''}${body}` }
    }

    throw new FetchError('fetch_failed', '重定向次数过多')
  }

  private request(url: string): Promise<Response> {
    return fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // 不携带 Cookie；用常见浏览器头减少被直接拒绝的概率
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
      },
    }).catch((err: unknown) => {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new FetchError('fetch_failed', '抓取页面超时')
      }
      throw new FetchError('fetch_failed', '无法访问该链接')
    })
  }
}

export function normalizeUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new FetchError('blocked_url', '链接格式不正确')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError('blocked_url', '只支持 http / https 链接')
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new FetchError('blocked_url', '不支持非标准端口')
  }
  url.hash = ''
  return url.toString()
}

async function assertPublicHost(url: string): Promise<void> {
  const { hostname } = new URL(url)
  if (!hostname) {
    throw new FetchError('blocked_url', '链接缺少域名')
  }
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) {
      throw new FetchError('blocked_url', '不允许访问内网地址')
    }
    return
  }
  const addresses = await lookup(hostname, { all: true }).catch(() => {
    throw new FetchError('fetch_failed', '域名解析失败')
  })
  if (addresses.length === 0 || addresses.some((item) => !isPublicAddress(item.address))) {
    throw new FetchError('blocked_url', '该域名指向内网地址')
  }
}

function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const parts = ip.split('.').map(Number)
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return false
    }
    const [a, b] = parts
    if (a === 0 || a === 10 || a === 127) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 192 && b === 0) return false
    if (a === 198 && (b === 18 || b === 19)) return false
    if (a >= 224) return false
    return true
  }

  const v6 = ip.toLowerCase()
  if (v6 === '::1' || v6 === '::') return false
  if (v6.startsWith('::ffff:')) {
    return isPublicAddress(v6.slice('::ffff:'.length))
  }
  if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return false
  if (v6.startsWith('ff')) return false
  return true
}

async function readLimited(response: Response): Promise<string> {
  if (!response.body) {
    return ''
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (value) {
      total += value.byteLength
      if (total > MAX_BYTES) {
        await reader.cancel()
        throw new FetchError('fetch_failed', '页面内容超过 5MB')
      }
      chunks.push(value)
    }
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks.map((item) => Buffer.from(item))))
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() : ''
  return title ? title.slice(0, 120) : null
}

/** 从 JSON-LD 里找 schema.org/Recipe，命中则完全跳过模型 */
function extractJsonLdRecipe(html: string): RecipeDraft | null {
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    const raw = match[1].trim()
    if (!raw) {
      continue
    }
    try {
      const node = JSON.parse(raw)
      const recipe = findRecipeNode(node)
      if (recipe) {
        const draft = toDraft(recipe)
        if (draft) {
          return draft
        }
      }
    } catch {
      // 单个 JSON-LD 块损坏不影响继续找下一个
    }
  }
  return null
}

function findRecipeNode(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || depth > 4) {
    return null
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item, depth + 1)
      if (found) {
        return found
      }
    }
    return null
  }
  if (typeof node !== 'object') {
    return null
  }
  const record = node as Record<string, unknown>
  const type = record['@type']
  const types = Array.isArray(type) ? type : [type]
  if (types.some((item) => typeof item === 'string' && item.toLowerCase() === 'recipe')) {
    return record
  }
  for (const value of Object.values(record)) {
    const found = findRecipeNode(value, depth + 1)
    if (found) {
      return found
    }
  }
  return null
}

function toDraft(node: Record<string, unknown>): RecipeDraft | null {
  const name = str(node.name)
  const ingredientStrings = Array.isArray(node.recipeIngredient)
    ? node.recipeIngredient.map((item) => str(item)).filter((item) => item.length > 0)
    : []

  const steps: DraftStep[] = []
  collectSteps(node.recipeInstructions, steps)

  const parsed = ingredientStrings.map(parseIngredientLine)
  if (!name || parsed.length === 0 || steps.length === 0) {
    return null
  }
  // 用量大面积缺失时，说明这份 JSON-LD 不够用，转交模型补全更靠谱
  const missing = parsed.filter((item) => item.quantity.length === 0).length
  if (missing > parsed.length / 2) {
    return null
  }

  const warnings: string[] = []
  if (missing > 0) {
    warnings.push(`有 ${missing} 种食材原文未标注用量，请核对`)
  }

  return {
    name,
    description: htmlToText(str(node.description)).slice(0, 500),
    baseServings: parseYield(node.recipeYield),
    prepMinutes: parseDuration(node.prepTime),
    cookMinutes: parseDuration(node.cookTime),
    seasonMonths: [],
    ingredients: parsed.slice(0, 60),
    steps: steps.slice(0, 40),
    tags: [],
    warnings,
  }
}

function collectSteps(value: unknown, out: DraftStep[], depth = 0): void {
  if (!value || depth > 4 || out.length >= 40) {
    return
  }
  if (typeof value === 'string') {
    const content = htmlToText(value).slice(0, 500)
    if (content) {
      out.push({ content })
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSteps(item, out, depth + 1)
    }
    return
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.itemListElement) {
      collectSteps(record.itemListElement, out, depth + 1)
      return
    }
    const content = htmlToText(str(record.text) || str(record.name)).slice(0, 500)
    if (content) {
      out.push({ content })
    }
  }
}

function parseIngredientLine(line: string): DraftIngredient {
  const cleaned = line
    .replace(/^[\s•·\-*]+/, '')
    .replace(/\s+/g, ' ')
    .trim()

  const colon = cleaned.match(/^([^：:]{1,30})[：:]\s*(.+)$/)
  if (colon) {
    const parsed = splitQuantity(colon[2])
    return { name: cleanName(colon[1]), quantity: parsed.quantity, unit: parsed.unit }
  }

  const leadingFraction = cleaned.match(/^(\d+\/\d+)\s*(.*)$/)
  if (leadingFraction) {
    const parsed = splitUnit(leadingFraction[2])
    return { name: cleanName(parsed.name), quantity: leadingFraction[1], unit: parsed.unit }
  }

  const leading = cleaned.match(/^(\d+(?:\.\d+)?(?:\s*[-~]\s*\d+(?:\.\d+)?)?)\s*(.*)$/)
  if (leading) {
    const parsed = splitUnit(leading[2])
    return {
      name: cleanName(parsed.name),
      quantity: leading[1].replace(/\s+/g, ''),
      unit: parsed.unit,
    }
  }

  const trailing = cleaned.match(/^([^\d]{1,40}?)\s*(\d+(?:\.\d+)?)\s*(.*)$/)
  if (trailing) {
    const parsed = splitUnit(trailing[3])
    return { name: cleanName(trailing[1]), quantity: trailing[2], unit: parsed.unit }
  }

  const named = splitUnit(cleaned)
  return { name: cleanName(named.name), quantity: '', unit: named.unit }
}

function cleanName(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[,;，；。、]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

/** 处理「2个」「200克」「1 tbsp」这类前缀已抽出数量后的剩余串 */
function splitUnit(rest: string): { name: string; unit: string } {
  const trimmed = rest.trim()
  const cjk = CJK_UNITS.find((item) => trimmed.startsWith(item))
  if (cjk) {
    return { name: trimmed.slice(cjk.length).trim(), unit: cjk }
  }
  // 英文单位必须是独立单词，"large eggs" 里的 l 不算单位
  const ascii = trimmed.match(/^([a-zA-Z]{1,6})(?=\s|$)/)
  if (ascii && ASCII_UNITS.has(ascii[1].toLowerCase())) {
    return { name: trimmed.slice(ascii[1].length).trim(), unit: ascii[1].toLowerCase() }
  }
  return { name: trimmed, unit: '' }
}

function splitQuantity(rest: string): { quantity: string; unit: string } {
  const matched = rest.trim().match(/^(\d+\/\d+|\d+(?:\.\d+)?(?:\s*[-~]\s*\d+(?:\.\d+)?)?)\s*([^\s\d]*)/)
  if (!matched) {
    return { quantity: rest.trim().slice(0, 20), unit: '' }
  }
  return { quantity: matched[1].replace(/\s+/g, ''), unit: matched[2].slice(0, 20) }
}

const CJK_UNITS = [
  '汤匙',
  '茶匙',
  '小勺',
  '大勺',
  '毫升',
  '千克',
  '公斤',
  '厘米',
  '克',
  '斤',
  '两',
  '升',
  '个',
  '只',
  '根',
  '颗',
  '片',
  '块',
  '条',
  '把',
  '勺',
  '杯',
  '碗',
  '瓣',
  '粒',
  '张',
  '段',
  '朵',
  '头',
  '串',
  '包',
  '袋',
  '盒',
  '罐',
  '份',
  '寸',
].sort((a, b) => b.length - a.length)

const ASCII_UNITS = new Set([
  'tbsp',
  'tsp',
  'cup',
  'cups',
  'oz',
  'lb',
  'lbs',
  'g',
  'kg',
  'ml',
  'l',
  'clove',
  'cloves',
  'can',
  'cans',
  'slice',
  'slices',
  'piece',
  'pieces',
  'pinch',
  'bunch',
  'sprig',
  'sprigs',
  'stick',
  'sticks',
])

/** Cloudflare / 滑动验证这类人机校验页，直接给出可理解的错误 */
function isChallengePage(html: string): boolean {
  const head = html.slice(0, 4000)
  return /just a moment|attention required|cf-challenge|滑动验证|安全验证|人机验证|访问过于频繁|verify you are human/i.test(
    head,
  )
}

function parseYield(value: unknown): number {
  const first = Array.isArray(value) ? value[0] : value
  if (typeof first === 'number' && Number.isFinite(first)) {
    return clampServings(first)
  }
  if (typeof first === 'string') {
    const matched = first.match(/\d+/)
    if (matched) {
      return clampServings(Number(matched[0]))
    }
  }
  return 2
}

function clampServings(value: number): number {
  return Math.min(20, Math.max(1, Math.round(value)))
}

/** ISO 8601 duration（PT1H30M）转分钟 */
function parseDuration(value: unknown): number {
  if (typeof value !== 'string') {
    return 0
  }
  const matched = value.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?$/i)
  if (!matched) {
    return 0
  }
  const days = Number(matched[1] ?? 0)
  const hours = Number(matched[2] ?? 0)
  const minutes = Number(matched[3] ?? 0)
  return Math.min(1440, days * 1440 + hours * 60 + minutes)
}

function str(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return ''
}

export function htmlToText(html: string): string {
  if (!html) {
    return ''
  }
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
}
