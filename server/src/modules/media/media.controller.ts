import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { STORAGE_ADAPTER, type StorageAdapter } from '../../infra/storage/storage.adapter'
import { MediaService } from './media.service'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']

@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
    @Body('purpose') purpose?: string,
  ): Promise<{ key: string; url: string }> {
    if (!file || file.size === 0) {
      throw new BadRequestException('未接收到文件')
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('图片超过 10MB')
    }
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('仅支持 jpg / png / webp')
    }
    return this.mediaService.uploadImage(user.userId, file, purpose ?? 'recipe')
  }

  /** 签名地址访问，无需登录头（<image> 标签无法携带 Authorization） */
  @Get('file')
  async file(
    @Query('key') key?: string,
    @Query('exp') exp?: string,
    @Query('sig') sig?: string,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<StreamableFile> {
    if (!key || !exp || !sig) {
      throw new BadRequestException('缺少签名参数')
    }
    if (!this.storage.verifyGetUrl(key, Number(exp), sig)) {
      throw new ForbiddenException('图片链接已失效')
    }

    const object = await this.storage.getObject(key)
    res?.setHeader('Content-Type', object.contentType)
    res?.setHeader('Content-Length', String(object.size))
    res?.setHeader('Cache-Control', 'private, max-age=86400')
    return new StreamableFile(object.stream)
  }
}
