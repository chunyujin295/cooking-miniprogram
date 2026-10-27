import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import sharp from 'sharp'
import { PrismaService } from '../../infra/database/prisma.service'
import { STORAGE_ADAPTER, type StorageAdapter, type StoredObject } from '../../infra/storage/storage.adapter'

const IMAGE_URL_TTL_SECONDS = 7 * 24 * 60 * 60
const THUMB_QUALITY = 78
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** 卡片封面：菜谱列表、点菜网格、抽菜结果共用 */
export const COVER_WIDTH = 480
/** 详情页大图 / 步骤图 */
export const DETAIL_WIDTH = 960

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  /** 上传图片：菜谱图按家庭归档，头像按用户归档 */
  async uploadImage(
    userId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
    purpose: string,
  ): Promise<{ key: string; url: string }> {
    const ext = EXTENSION_BY_MIME[file.mimetype] ?? 'jpg'
    let key: string

    if (purpose === 'avatar') {
      key = `avatars/${userId}/${randomUUID()}.${ext}`
    } else {
      const membership = await this.prisma.householdMember.findFirst({
        where: { userId, status: 'active' },
      })
      if (!membership) {
        throw new NotFoundException('尚未加入家庭')
      }
      const month = new Date().toISOString().slice(0, 7).replace('-', '')
      key = `households/${membership.householdId}/recipes/${month}/${randomUUID()}.${ext}`
    }

    await this.storage.putObject({ key, body: file.buffer, contentType: file.mimetype })

    return { key, url: this.storage.signGetUrl(key, IMAGE_URL_TTL_SECONDS) }
  }

  /** 把库里存的 key 批量换成临时签名地址；width 让服务端返回等比压缩后的缩略图 */
  signUrls(keys: string[], width?: number): string[] {
    return keys.map((key) => this.storage.signGetUrl(key, IMAGE_URL_TTL_SECONDS, width))
  }

  /**
   * 按宽度取缩略图：第一次请求时用 sharp 生成 webp 变体写回对象存储，
   * 之后直接命中缓存返回，原图保持不变。
   */
  async getThumbnail(key: string, width: number): Promise<StoredObject> {
    const thumbKey = `thumbs/w${width}/${key}`
    try {
      return await this.storage.getObject(thumbKey)
    } catch (err) {
      if (!(err instanceof NotFoundException)) {
        throw err
      }
    }

    const original = await this.storage.getObject(key)
    const chunks: Buffer[] = []
    for await (const chunk of original.stream) {
      chunks.push(chunk as Buffer)
    }

    const buffer = await sharp(Buffer.concat(chunks))
      // 手机竖拍常带 EXIF 方向，先摆正再缩放
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer()

    await this.storage.putObject({ key: thumbKey, body: buffer, contentType: 'image/webp' })

    return {
      stream: Readable.from(buffer),
      contentType: 'image/webp',
      size: buffer.length,
    }
  }
}
