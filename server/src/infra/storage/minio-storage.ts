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

  /** 用 JWT 密钥对 key+过期时间签名，避免依赖存储侧的对外域名 */
  signGetUrl(key: string, expiresInSeconds: number): string {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds
    const sig = this.sign(key, expiresAt)
    return `/media/file?key=${encodeURIComponent(key)}&exp=${expiresAt}&sig=${sig}`
  }

  verifyGetUrl(key: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
      return false
    }
    const expected = this.sign(key, exp)
    const a = Buffer.from(expected)
    const b = Buffer.from(sig)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private sign(key: string, expiresAt: number): string {
    return createHmac('sha256', this.config.jwtSecret).update(`${key}|${expiresAt}`).digest('hex')
  }

  private requireClient(): Client {
    if (!this.client) {
      throw new ServiceUnavailableException('对象存储未配置')
    }
    return this.client
  }
}
