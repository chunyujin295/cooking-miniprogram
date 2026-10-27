import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../infra/database/prisma.service'
import { LlmError, LlmService } from '../../infra/llm/llm.service'
import type { CreateRecipeImportDto } from './dto/create-recipe-import.dto'
import { RECIPE_SYSTEM_PROMPT, buildUserPrompt } from './prompts'
import { normalizeDraft, type RecipeDraft } from './recipe-draft'
import { FetchError, UrlFetcherService } from './url-fetcher.service'

const HOUSEHOLD_DAILY_LIMIT = 20
const USER_DAILY_LIMIT = 10
const BREAKER_THRESHOLD = 3
const BREAKER_COOLDOWN_MS = 10 * 60 * 1000
const FALLBACK_CHARS = 4000
const DAY_MS = 24 * 60 * 60 * 1000
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000

export type ImportErrorCode =
  | 'blocked_url'
  | 'fetch_failed'
  | 'no_content'
  | 'site_blocked'
  | 'not_configured'
  | 'llm_timeout'
  | 'llm_failed'
  | 'llm_invalid_json'
  | 'quota_exceeded'
  | 'circuit_open'
  | 'invalid_input'

export interface ImportResultView {
  id: string
  status: 'succeeded' | 'failed'
  sourceTitle: string | null
  draft: RecipeDraft | null
  errorCode: ImportErrorCode | null
  fallbackText: string | null
  usage: { tokenIn: number; tokenOut: number; durationMs: number }
}

@Injectable()
export class RecipeImportService {
  private readonly logger = new Logger(RecipeImportService.name)
  /** 家庭级熔断：连续失败 3 次后暂停 10 分钟，避免坏链接+计费反复空转 */
  private readonly breaker = new Map<string, { failures: number; until: number }>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly fetcher: UrlFetcherService,
    private readonly llm: LlmService,
  ) {}

  async create(userId: string, dto: CreateRecipeImportDto): Promise<ImportResultView> {
    const { householdId } = await this.requireMembership(userId)
    const startedAt = Date.now()

    const input = this.readInput(dto)
    if ('errorCode' in input) {
      return this.emptyResult(input.errorCode)
    }

    if (this.isBreakerOpen(householdId)) {
      return this.emptyResult('circuit_open')
    }
    const quota = await this.overQuota(householdId, userId)
    if (quota) {
      return this.emptyResult('quota_exceeded')
    }

    const job = await this.prisma.recipeImport.create({
      data: {
        householdId,
        userId,
        sourceType: input.sourceType,
        sourceUrl: input.sourceType === 'url' ? input.url : null,
        inputChars: input.text.length,
      },
    })

    let fallbackText: string | null = null
    let fetchedBody: string | null = null
    try {
      let text = input.text
      let title: string | null = null
      let draft: RecipeDraft | null = null

      if (input.sourceType === 'url') {
        const page = await this.fetcher.fetchPage(input.url)
        title = page.title
        text = page.text
        draft = page.draft
        fetchedBody = text
      }

      if (!draft) {
        if (!this.llm.isConfigured()) {
          throw new LlmError('not_configured', '未配置大模型密钥')
        }
        const result = await this.llm.chatJSON(
          RECIPE_SYSTEM_PROMPT,
          buildUserPrompt({ title, text }),
        )
        const raw = result.data as Record<string, unknown> | null
        if (raw && raw.error === 'not_recipe') {
          throw new LlmError('llm_invalid_json', '没有识别到完整菜谱')
        }
        draft = normalizeDraft(raw)
        if (!draft) {
          throw new LlmError('llm_invalid_json', '模型结果缺少菜名、食材或步骤')
        }

        const durationMs = Date.now() - startedAt
        await this.prisma.recipeImport.update({
          where: { id: job.id },
          data: {
            status: 'succeeded',
            sourceTitle: title,
            draft: draft as unknown as object,
            tokenIn: result.tokenIn,
            tokenOut: result.tokenOut,
            durationMs,
          },
        })
        this.breaker.delete(householdId)
        return {
          id: job.id,
          status: 'succeeded',
          sourceTitle: title,
          draft,
          errorCode: null,
          fallbackText: null,
          usage: { tokenIn: result.tokenIn, tokenOut: result.tokenOut, durationMs },
        }
      }

      // JSON-LD 命中，未消耗 token
      const durationMs = Date.now() - startedAt
      await this.prisma.recipeImport.update({
        where: { id: job.id },
        data: {
          status: 'succeeded',
          sourceTitle: title,
          draft: draft as unknown as object,
          durationMs,
        },
      })
      this.breaker.delete(householdId)
      return {
        id: job.id,
        status: 'succeeded',
        sourceTitle: title,
        draft,
        errorCode: null,
        fallbackText: null,
        usage: { tokenIn: 0, tokenOut: 0, durationMs },
      }
    } catch (err) {
      const errorCode = this.describeError(err)
      // 抓取成功但抽取失败时，把原文回传给前端做手填兜底
      fallbackText = (input.sourceType === 'url' ? fetchedBody : input.text)?.slice(0, FALLBACK_CHARS) ?? null
      const durationMs = Date.now() - startedAt
      await this.prisma.recipeImport.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorCode,
          fallbackText,
          durationMs,
        },
      })
      this.markFailure(householdId, errorCode)
      this.logger.warn(`导入失败 ${errorCode}: ${err instanceof Error ? err.message : 'unknown'}`)
      return {
        id: job.id,
        status: 'failed',
        sourceTitle: null,
        draft: null,
        errorCode,
        fallbackText,
        usage: { tokenIn: 0, tokenOut: 0, durationMs },
      }
    }
  }

  /** 保存为菜谱后回填，用于统计导入成功率 */
  async link(userId: string, jobId: string, recipeId: string): Promise<{ id: string; recipeId: string }> {
    const { householdId } = await this.requireMembership(userId)
    const job = await this.prisma.recipeImport.findFirst({
      where: { id: jobId, householdId },
      select: { id: true },
    })
    if (!job) {
      throw new NotFoundException('导入记录不存在')
    }
    const recipe = await this.prisma.recipe.findFirst({
      where: { id: recipeId, householdId },
      select: { id: true },
    })
    if (!recipe) {
      throw new NotFoundException('菜谱不存在')
    }
    await this.prisma.recipeImport.update({ where: { id: jobId }, data: { recipeId } })
    return { id: jobId, recipeId }
  }

  async detail(userId: string, jobId: string) {
    const { householdId } = await this.requireMembership(userId)
    const job = await this.prisma.recipeImport.findFirst({ where: { id: jobId, householdId } })
    if (!job) {
      throw new NotFoundException('导入记录不存在')
    }
    return {
      id: job.id,
      sourceType: job.sourceType,
      sourceUrl: job.sourceUrl,
      sourceTitle: job.sourceTitle,
      status: job.status,
      errorCode: job.errorCode,
      draft: job.draft,
      tokenIn: job.tokenIn,
      tokenOut: job.tokenOut,
      durationMs: job.durationMs,
      recipeId: job.recipeId,
      createdAt: job.createdAt,
    }
  }

  private readInput(
    dto: CreateRecipeImportDto,
  ):
    | { sourceType: 'text'; text: string }
    | { sourceType: 'url'; url: string; text: string }
    | { errorCode: ImportErrorCode } {
    if (dto.sourceType === 'url') {
      const url = dto.url?.trim() ?? ''
      if (!/^https?:\/\//i.test(url)) {
        return { errorCode: 'invalid_input' }
      }
      return { sourceType: 'url', url, text: url }
    }
    const text = dto.text?.trim() ?? ''
    if (text.length < 20) {
      return { errorCode: 'invalid_input' }
    }
    return { sourceType: 'text', text }
  }

  private async overQuota(householdId: string, userId: string): Promise<boolean> {
    const { start, end } = todayRange()
    const where = { createdAt: { gte: start, lt: end }, status: { not: 'failed' as const } }
    const [householdCount, userCount] = await Promise.all([
      this.prisma.recipeImport.count({ where: { ...where, householdId } }),
      this.prisma.recipeImport.count({ where: { ...where, userId } }),
    ])
    return householdCount >= HOUSEHOLD_DAILY_LIMIT || userCount >= USER_DAILY_LIMIT
  }

  private isBreakerOpen(householdId: string): boolean {
    const state = this.breaker.get(householdId)
    return !!state && state.until > Date.now()
  }

  /** 熔断只看模型侧健康度：链接打不开、内网地址这些不牵连模型 */
  private markFailure(householdId: string, errorCode: ImportErrorCode): void {
    if (!errorCode.startsWith('llm_') && errorCode !== 'not_configured') {
      return
    }
    const state = this.breaker.get(householdId) ?? { failures: 0, until: 0 }
    state.failures += 1
    if (state.failures >= BREAKER_THRESHOLD) {
      state.until = Date.now() + BREAKER_COOLDOWN_MS
      state.failures = 0
    }
    this.breaker.set(householdId, state)
  }

  private describeError(err: unknown): ImportErrorCode {
    if (err instanceof FetchError) {
      return err.code
    }
    if (err instanceof LlmError) {
      return err.code
    }
    return 'llm_failed'
  }

  private emptyResult(errorCode: ImportErrorCode): ImportResultView {
    return {
      id: '',
      status: 'failed',
      sourceTitle: null,
      draft: null,
      errorCode,
      fallbackText: null,
      usage: { tokenIn: 0, tokenOut: 0, durationMs: 0 },
    }
  }

  private async requireMembership(userId: string): Promise<{ householdId: string }> {
    const membership = await this.prisma.householdMember.findFirst({
      where: { userId, status: 'active' },
      select: { householdId: true },
    })
    if (!membership) {
      throw new NotFoundException('尚未加入家庭')
    }
    return { householdId: membership.householdId }
  }
}

/** 按 UTC+8 自然日取范围，与统计口径一致 */
function todayRange(): { start: Date; end: Date } {
  const dayStart = Math.floor((Date.now() + CHINA_OFFSET_MS) / DAY_MS) * DAY_MS - CHINA_OFFSET_MS
  return { start: new Date(dayStart), end: new Date(dayStart + DAY_MS) }
}
