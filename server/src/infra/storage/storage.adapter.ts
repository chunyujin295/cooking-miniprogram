import type { Readable } from 'node:stream'

export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER')

export interface PutObjectInput {
  key: string
  body: Buffer
  contentType: string
}

export interface StoredObject {
  stream: Readable
  contentType: string
  size: number
}

/** 对象存储适配器：业务层只依赖该接口，不依赖具体服务商 */
export interface StorageAdapter {
  putObject(input: PutObjectInput): Promise<{ key: string }>
  getObject(key: string): Promise<StoredObject>
  /** 生成对外可访问的临时签名地址（桶本身不开放公开读） */
  signGetUrl(key: string, expiresInSeconds: number): string
  /** 校验签名地址是否有效且未过期 */
  verifyGetUrl(key: string, expiresAt: number, sig: string): boolean
}
