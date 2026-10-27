import { Injectable, Logger } from '@nestjs/common'
import { loadConfig } from '../../config/env'

export type LlmErrorCode = 'not_configured' | 'llm_timeout' | 'llm_failed' | 'llm_invalid_json'

export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'LlmError'
  }
}

export interface ChatJsonResult {
  data: unknown
  raw: string
  tokenIn: number
  tokenOut: number
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string; code?: string }
}

const DEFAULT_TIMEOUT_MS = 20000
// glm-4v-flash 的 max_tokens 上限是 1024，取小值保证跨模型可用
const DEFAULT_MAX_TOKENS = 1024

/**
 * OpenAI 兼容协议的极简封装（智谱 GLM 走 /chat/completions）。
 * 只做一件事：让模型输出 JSON，解析失败重试一次。
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name)

  isConfigured(): boolean {
    return loadConfig().llm.apiKey.length > 0
  }

  async chatJSON(system: string, user: string): Promise<ChatJsonResult> {
    const first = await this.call(system, user)
    try {
      return { ...first, data: parseJson(first.raw) }
    } catch {
      this.logger.warn('模型输出不是合法 JSON，重试一次')
      const second = await this.call(
        system,
        `${user}\n\n注意：只输出 JSON 本体，不要 Markdown 代码块、不要任何解释文字。`,
      )
      try {
        return { ...second, data: parseJson(second.raw) }
      } catch {
        throw new LlmError('llm_invalid_json', '模型返回的结构无法解析')
      }
    }
  }

  private async call(system: string, user: string): Promise<Omit<ChatJsonResult, 'data'>> {
    const { baseUrl, apiKey, modelText } = loadConfig().llm
    if (!apiKey) {
      throw new LlmError('not_configured', '未配置大模型密钥')
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelText,
          temperature: 0.1,
          max_tokens: DEFAULT_MAX_TOKENS,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: controller.signal,
      })

      const body = (await response.json().catch(() => null)) as ChatResponse | null
      if (!response.ok) {
        // 只记录状态码与厂商错误信息，绝不带请求头
        this.logger.warn(`LLM ${response.status}: ${body?.error?.message ?? 'unknown'}`)
        throw new LlmError('llm_failed', `模型服务返回 ${response.status}`)
      }

      const content = body?.choices?.[0]?.message?.content
      if (!content) {
        throw new LlmError('llm_failed', '模型返回内容为空')
      }

      return {
        raw: content,
        tokenIn: body?.usage?.prompt_tokens ?? 0,
        tokenOut: body?.usage?.completion_tokens ?? 0,
      }
    } catch (err) {
      if (err instanceof LlmError) {
        throw err
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new LlmError('llm_timeout', '模型响应超时')
      }
      throw new LlmError('llm_failed', err instanceof Error ? err.message : '模型调用失败')
    } finally {
      clearTimeout(timer)
    }
  }
}

/** 容忍 ```json 包裹与前后解释文字，截取第一个完整 JSON 对象 */
function parseJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) {
      throw new Error('no json object')
    }
    return JSON.parse(text.slice(start, end + 1))
  }
}
