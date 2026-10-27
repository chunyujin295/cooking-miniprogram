export interface AppConfig {
  port: number
  databaseUrl: string
  jwtSecret: string
  storage: {
    endPoint: string
    bucket: string
    accessKey: string
    secretKey: string
  }
  wechat: {
    appId: string
    appSecret: string
    /** 订阅消息模板 id，未配置时降级为站内通知 */
    templates: {
      mealConfirmed: string
      taskAccepted: string
      mealServed: string
    }
  }
  nutrition: {
    provider: string
    apiKey: string
  }
  /** 大模型（OpenAI 兼容协议），未配置 apiKey 时 AI 导入自动降级 */
  llm: {
    baseUrl: string
    apiKey: string
    modelText: string
    modelVision: string
  }
}

function env(name: string, fallback: string): string {
  const value = process.env[name]
  return value && value.length > 0 ? value : fallback
}

export function loadConfig(): AppConfig {
  return {
    port: Number(env('PORT', '3000')),
    databaseUrl: env('DATABASE_URL', 'postgresql://cooking:cooking@127.0.0.1:5433/cooking'),
    jwtSecret: env('JWT_SECRET', 'dev-only-change-me'),
    storage: {
      endPoint: env('STORAGE_ENDPOINT', 'http://127.0.0.1:9000'),
      bucket: env('STORAGE_BUCKET', 'cooking'),
      accessKey: env('STORAGE_ACCESS_KEY', ''),
      secretKey: env('STORAGE_SECRET_KEY', ''),
    },
    wechat: {
      appId: env('WECHAT_APP_ID', ''),
      appSecret: env('WECHAT_APP_SECRET', ''),
      templates: {
        mealConfirmed: env('WECHAT_TMPL_MEAL_CONFIRMED', ''),
        taskAccepted: env('WECHAT_TMPL_TASK_ACCEPTED', ''),
        mealServed: env('WECHAT_TMPL_MEAL_SERVED', ''),
      },
    },
    nutrition: {
      provider: env('NUTRITION_PROVIDER', 'stub'),
      apiKey: env('NUTRITION_API_KEY', ''),
    },
    llm: {
      baseUrl: env('LLM_BASE_URL', 'https://open.bigmodel.cn/api/paas/v4'),
      apiKey: env('LLM_API_KEY', ''),
      modelText: env('LLM_MODEL_TEXT', 'glm-4v-flash'),
      modelVision: env('LLM_MODEL_VISION', 'glm-4v-flash'),
    },
  }
}