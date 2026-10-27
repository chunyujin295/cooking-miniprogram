import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../infra/database/prisma.service'
import { STORAGE_ADAPTER, type StorageAdapter } from '../../infra/storage/storage.adapter'

const IMAGE_URL_TTL_SECONDS = 7 * 24 * 60 * 60
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

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

  /** 把库里存的 key 批量换成临时签名地址 */
  signUrls(keys: string[]): string[] {
    return keys.map((key) => this.storage.signGetUrl(key, IMAGE_URL_TTL_SECONDS))
  }
}
