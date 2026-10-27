import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../infra/database/prisma.service'
import type { UpdateDietaryDto } from './dto/update-dietary.dto'

export interface DietaryProfileView {
  allergens: string[]
  avoidances: string[]
  note: string | null
}

export interface DietaryCheckItem {
  recipeId: string
  name: string
  matched: string[]
}

@Injectable()
export class DietaryService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string): Promise<DietaryProfileView> {
    const householdId = await this.requireHouseholdId(userId)
    const profile = await this.prisma.memberDietaryProfile.findUnique({
      where: { householdId_userId: { householdId, userId } },
    })
    if (!profile) {
      await this.prisma.memberDietaryProfile.create({ data: { householdId, userId } })
      return { allergens: [], avoidances: [], note: null }
    }
    return { allergens: profile.allergens, avoidances: profile.avoidances, note: profile.note }
  }

  async update(userId: string, dto: UpdateDietaryDto): Promise<DietaryProfileView> {
    const householdId = await this.requireHouseholdId(userId)
    const profile = await this.prisma.memberDietaryProfile.upsert({
      where: { householdId_userId: { householdId, userId } },
      create: {
        householdId,
        userId,
        allergens: normalize(dto.allergens),
        avoidances: normalize(dto.avoidances),
        note: dto.note ?? null,
      },
      update: {
        ...(dto.allergens !== undefined ? { allergens: normalize(dto.allergens) } : {}),
        ...(dto.avoidances !== undefined ? { avoidances: normalize(dto.avoidances) } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    })
    return { allergens: profile.allergens, avoidances: profile.avoidances, note: profile.note }
  }

  /** 按食材名匹配本人的过敏原与忌口，返回命中的菜谱（不阻断点菜） */
  async check(userId: string, recipeIds: string[]): Promise<DietaryCheckItem[]> {
    if (recipeIds.length === 0) {
      return []
    }
    const householdId = await this.requireHouseholdId(userId)
    const profile = await this.prisma.memberDietaryProfile.findUnique({
      where: { householdId_userId: { householdId, userId } },
    })
    const keywords = [...(profile?.allergens ?? []), ...(profile?.avoidances ?? [])].filter(
      (item) => item.length > 0,
    )
    if (keywords.length === 0) {
      return []
    }

    const recipes = await this.prisma.recipe.findMany({
      where: { id: { in: recipeIds }, householdId },
      select: {
        id: true,
        name: true,
        ingredients: { select: { name: true } },
      },
    })

    const result: DietaryCheckItem[] = []
    for (const recipe of recipes) {
      const matched = new Set<string>()
      for (const ingredient of recipe.ingredients) {
        const name = ingredient.name.toLowerCase()
        for (const keyword of keywords) {
          if (name.includes(keyword.toLowerCase())) {
            matched.add(keyword)
          }
        }
      }
      if (matched.size > 0) {
        result.push({ recipeId: recipe.id, name: recipe.name, matched: Array.from(matched) })
      }
    }
    return result
  }

  private async requireHouseholdId(userId: string): Promise<string> {
    const membership = await this.prisma.householdMember.findFirst({
      where: { userId, status: 'active' },
      select: { householdId: true },
    })
    if (!membership) {
      throw new NotFoundException('尚未加入家庭')
    }
    return membership.householdId
  }
}

function normalize(list?: string[]): string[] {
  if (!list) {
    return []
  }
  return Array.from(new Set(list.map((item) => item.trim()).filter((item) => item.length > 0)))
}
