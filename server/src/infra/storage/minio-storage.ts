import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Client } from 'minio'
import { loadConfig } from '../../config/env'
import type { PutObjectInput, StorageAdapter, StoredObject } from './storage.adapter'

@Injectable()
export class MinioStorage implements StorageAdapter, OnModuleInit {
  private readonly logger = new Logger(MinioStorage.name)
  private readonly config = loadConfig()
  private readonly client: Client | null

  constructor() {
    const { endPoint, accessKey, secretKey } = this.config.storage
    if (!accessKey || !secretKey) {
      this.client = null
      return
    }
    const url = new URL(endPoint)
    this.client = new Client({
      endPoint: url.hostname,
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      useSSL: url.protocol === 'https:',
      accessKey,
      secretKey,
      region: 'us-east-1',
    })
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) {
      this.logger.warn('对象存储未配置，图片上传不可用')
      return
    }
    const { bucket } = this.config.storage
    try {
      if (!(await this.client.bucketExists(bucket))) {
        await this.client.makeBucket(bucket, 'us-east-1')
        this.logger.log(`已创建存储桶 ${bucket}`)
      }
    } catch (err) {
      this.logger.error(`存储桶初始化失败：${(err as Error).message}`)
    }
  }

  async putObject(input: PutObjectInput): Promise<{ key: string }> {
    const client = this.requireClient()
    await client.putObject(this.config.storage.bucket, input.key, input.body, input.body.length, {
      'Content-Type': input.contentType,
    })
    return { key: input.key }
  }

  async getObject(key: string): Promise<StoredObject> {
    const client = this.requireClient()
    const bucket = this.config.storage.bucket
    try {
      const stat = await client.statObject(bucket, key)
      const stream = await client.getObject(bucket, key)
      return {
        stream,
        contentType: stat.metaData['content-type'] ?? 'application/octet-stream',
        size: stat.size,
      }
    } catch {
      throw new NotFoundException('图片不存在')
    }
  }

  /** 用 JWT 密钥对 key+过期时间（+缩略图宽度）签名，避免依赖存储侧的对外域名 */
  signGetUrl(key: string, expiresInSeconds: number, width?: number): string {
    const expiresAt = this.stableExpiry(expiresInSeconds)
    const sig = this.sign(key, expiresAt, width)
    const widthPart = width ? `&w=${width}` : ''
    return `/media/file?key=${encodeURIComponent(key)}&exp=${expiresAt}&sig=${sig}${widthPart}`
  }

  /**
   * 按有效期对齐过期时间：同一时间窗内生成的地址完全一致，
   * 小程序/浏览器才能命中图片缓存，不会每次刷新都重新下载。
   */
  private stableExpiry(expiresInSeconds: number): number {
    const now = Math.floor(Date.now() / 1000)
    return (Math.floor(now / expiresInSeconds) + 2) * expiresInSeconds
  }

  verifyGetUrl(key: string, exp: number, sig: string, width?: number): boolean {
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
      return false
    }
    const expected = this.sign(key, exp, width)
    const a = Buffer.from(expected)
    const b = Buffer.from(sig)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private sign(key: string, expiresAt: number, width?: number): string {
    // 保留旧格式签名（不含宽度），让历史上已下发的链接继续有效
    const payload = width ? `${key}|${expiresAt}|w${width}` : `${key}|${expiresAt}`
    return createHmac('sha256', this.config.jwtSecret).update(payload).digest('hex')
  }

  private requireClient(): Client {
    if (!this.client) {
      throw new ServiceUnavailableException('对象存储未配置')
    }
    return this.client
  }
}
