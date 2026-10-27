import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../../infra/database/prisma.service'
import { STORAGE_ADAPTER, type StorageAdapter } from '../../infra/storage/storage.adapter'
import { WechatService } from '../../infra/wechat/wechat.service'
import type { UpdateProfileDto } from './dto/update-profile.dto'

const AVATAR_URL_TTL_SECONDS = 7 * 24 * 60 * 60

export interface ProfileView {
  id: string
  nickname: string | null
  avatarKey: string | null
  avatarUrl: string | null
}

export interface LoginResult {
  token: string
  user: ProfileView
  householdId: string | null
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wechat: WechatService,
    private readonly jwtService: JwtService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  async loginByWechatCode(code: string): Promise<LoginResult> {
    const session = await this.wechat.code2Session(code)

    const user = await this.prisma.user.upsert({
      where: { openid: session.openid },
      update: { unionid: session.unionid ?? undefined },
      create: { openid: session.openid, unionid: session.unionid },
    })

    const membership = await this.prisma.householdMember.findFirst({
      where: { userId: user.id, status: 'active' },
      select: { householdId: true },
    })

    const token = await this.jwtService.signAsync({ userId: user.id, openid: user.openid })

    return {
      token,
      user: this.toProfile(user),
      householdId: membership?.householdId ?? null,
    }
  }

  async profile(userId: string): Promise<ProfileView> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } })
    return this.toProfile(user)
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileView> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.nickname !== undefined ? { nickname: dto.nickname.trim() || null } : {}),
        ...(dto.avatarKey !== undefined ? { avatarUrl: dto.avatarKey || null } : {}),
      },
    })
    return this.toProfile(user)
  }

  private toProfile(user: {
    id: string
    nickname: string | null
    avatarUrl: string | null
  }): ProfileView {
    return {
      id: user.id,
      nickname: user.nickname,
      avatarKey: user.avatarUrl,
      avatarUrl: user.avatarUrl
        ? this.storage.signGetUrl(user.avatarUrl, AVATAR_URL_TTL_SECONDS)
        : null,
    }
  }
}
