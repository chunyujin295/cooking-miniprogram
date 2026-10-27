import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../infra/database/prisma.service'
import { MediaService } from '../media/media.service'
import { toNutritionView, type NutritionView } from '../nutrition/nutrition.types'
import type { CreateRecipeDto } from './dto/create-recipe.dto'
import { parseTagIds, type ListRecipesQuery } from './dto/list-recipes.query'

const recipeDetailInclude = {
  ingredients: { orderBy: { sortOrder: 'asc' } },
  steps: { orderBy: { stepNo: 'asc' } },
  tags: { include: { tag: true } },
  nutrition: true,
} satisfies Prisma.RecipeInclude

type RecipeWithDetail = Prisma.RecipeGetPayload<{ include: typeof recipeDetailInclude }>

export interface RecipeTagView {
  id: string
  name: string
}

export interface RecipeListItemView {
  id: string
  name: string
  coverUrl: string | null
  totalMinutes: number
  tags: RecipeTagView[]
  isArchived: boolean
  updatedAt: string
}

export interface RecipeDetailView extends RecipeListItemView {
  description: string | null
  baseServings: number
  prepMinutes: number
  cookMinutes: number
  seasonMonths: number[]
  /** 对象存储 key，编辑时原样回传 */
  imageUrls: string[]
  /** 已签名的可展示地址 */
  images: string[]
  ingredients: Array<{ name: string; quantity: string; unit: string }>
  steps: Array<{ stepNo: number; content: string; imageUrl: string | null }>
  tagIds: string[]
  /** manual | external-ai，用于说明内容来源 */
  source: string
  /** AI 估算的每份营养，未估算时为 null */
  nutrition: NutritionView | null
}

@Injectable()
export class RecipeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  async list(userId: string, query: ListRecipesQuery): Promise<RecipeListItemView[]> {
    const householdId = await this.requireHouseholdId(userId)
    const tagIds = parseTagIds(query.tagIds)

    const recipes = await this.prisma.recipe.findMany({
      where: {
        householdId,
        ...(query.includeArchived ? {} : { status: 'active' }),
        ...(query.keyword ? { name: { contains: query.keyword, mode: 'insensitive' } } : {}),
        ...(tagIds.length > 0 ? { tags: { some: { tagId: { in: tagIds } } } } : {}),
      },
      include: { tags: { include: { tag: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    })

    return recipes.map((recipe) => this.toListItem(recipe))
  }

  async detail(userId: string, id: string): Promise<RecipeDetailView> {
    const householdId = await this.requireHouseholdId(userId)
    const recipe = await this.prisma.recipe.findFirst({
      where: { id, householdId },
      include: recipeDetailInclude,
    })
    if (!recipe) {
      throw new NotFoundException('菜谱不存在')
    }
    return this.toDetail(recipe)
  }

  async create(userId: string, dto: CreateRecipeDto): Promise<RecipeDetailView> {
    const householdId = await this.requireHouseholdId(userId)
    const tagIds = await this.requireTagIds(householdId, dto.tagIds)

    const recipe = await this.prisma.recipe.create({
      data: {
        householdId,
        createdBy: userId,
        name: dto.name,
        description: dto.description ?? null,
        baseServings: dto.baseServings,
        prepMinutes: dto.prepMinutes,
        cookMinutes: dto.cookMinutes,
        seasonMonths: dto.seasonMonths ?? [],
        imageUrls: dto.imageUrls ?? [],
        source: dto.source ?? 'manual',
        ingredients: {
          create: dto.ingredients.map((item, index) => ({ ...item, sortOrder: index })),
        },
        steps: {
          create: dto.steps.map((step, index) => ({
            content: step.content,
            imageUrl: step.imageUrl ?? null,
            stepNo: index + 1,
          })),
        },
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
      include: recipeDetailInclude,
    })

    return this.toDetail(recipe)
  }

  async update(userId: string, id: string, dto: CreateRecipeDto): Promise<RecipeDetailView> {
    const householdId = await this.requireHouseholdId(userId)
    await this.requireOwnedRecipe(householdId, id)
    const tagIds = await this.requireTagIds(householdId, dto.tagIds)

    const recipe = await this.prisma.$transaction(async (tx) => {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } })
      await tx.recipeStep.deleteMany({ where: { recipeId: id } })
      await tx.recipeTag.deleteMany({ where: { recipeId: id } })

      return tx.recipe.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description ?? null,
          baseServings: dto.baseServings,
          prepMinutes: dto.prepMinutes,
          cookMinutes: dto.cookMinutes,
          seasonMonths: dto.seasonMonths ?? [],
          imageUrls: dto.imageUrls ?? [],
          version: { increment: 1 },
          ingredients: {
            create: dto.ingredients.map((item, index) => ({ ...item, sortOrder: index })),
          },
          steps: {
            create: dto.steps.map((step, index) => ({
              content: step.content,
              imageUrl: step.imageUrl ?? null,
              stepNo: index + 1,
            })),
          },
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
        },
        include: recipeDetailInclude,
      })
    })

    return this.toDetail(recipe)
  }

  /** 归档：不再进入随机抽菜与默认列表，历史点菜记录仍保留 */
  async archive(userId: string, id: string): Promise<{ id: string; isArchived: boolean }> {
    const householdId = await this.requireHouseholdId(userId)
    await this.requireOwnedRecipe(householdId, id)
    await this.prisma.recipe.update({
      where: { id },
      data: { status: 'archived', archivedAt: new Date() },
    })
    return { id, isArchived: true }
  }

  async restore(userId: string, id: string): Promise<{ id: string; isArchived: boolean }> {
    const householdId = await this.requireHouseholdId(userId)
    await this.requireOwnedRecipe(householdId, id)
    await this.prisma.recipe.update({
      where: { id },
      data: { status: 'active', archivedAt: null },
    })
    return { id, isArchived: false }
  }

  async listTags(
    userId: string,
  ): Promise<Array<{ id: string; name: string; category: string; recipeCount: number }>> {
    const householdId = await this.requireHouseholdId(userId)
    const tags = await this.prisma.tag.findMany({
      where: { householdId },
      include: { _count: { select: { recipes: true } } },
      orderBy: { name: 'asc' },
    })
    return tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      category: tag.category,
      recipeCount: tag._count.recipes,
    }))
  }

  async createTag(
    userId: string,
    name: string,
    category?: string,
  ): Promise<{ id: string; name: string; category: string }> {
    const householdId = await this.requireHouseholdId(userId)
    const tag = await this.prisma.tag.upsert({
      where: { householdId_name: { householdId, name: name.trim() } },
      update: {},
      create: { householdId, name: name.trim(), category: category ?? 'flavor' },
    })
    return { id: tag.id, name: tag.name, category: tag.category }
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

  private async requireOwnedRecipe(householdId: string, id: string): Promise<void> {
    const recipe = await this.prisma.recipe.findFirst({
      where: { id, householdId },
      select: { id: true },
    })
    if (!recipe) {
      throw new NotFoundException('菜谱不存在')
    }
  }

  private async requireTagIds(householdId: string, tagIds?: string[]): Promise<string[]> {
    const unique = Array.from(new Set(tagIds ?? []))
    if (unique.length === 0) {
      return []
    }
    const count = await this.prisma.tag.count({ where: { householdId, id: { in: unique } } })
    if (count !== unique.length) {
      throw new BadRequestException('存在无效的标签')
    }
    return unique
  }

  private toListItem(recipe: {
    id: string
    name: string
    imageUrls: string[]
    prepMinutes: number
    cookMinutes: number
    status: string
    updatedAt: Date
    tags: Array<{ tag: { id: string; name: string } }>
  }): RecipeListItemView {
    const [cover] = recipe.imageUrls
    return {
      id: recipe.id,
      name: recipe.name,
      coverUrl: cover ? this.mediaService.signUrls([cover])[0] : null,
      totalMinutes: recipe.prepMinutes + recipe.cookMinutes,
      tags: recipe.tags.map((item) => ({ id: item.tag.id, name: item.tag.name })),
      isArchived: recipe.status === 'archived',
      updatedAt: recipe.updatedAt.toISOString(),
    }
  }

  private toDetail(recipe: RecipeWithDetail): RecipeDetailView {
    return {
      ...this.toListItem(recipe),
      description: recipe.description,
      baseServings: recipe.baseServings,
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      seasonMonths: recipe.seasonMonths,
      imageUrls: recipe.imageUrls,
      images: this.mediaService.signUrls(recipe.imageUrls),
      ingredients: recipe.ingredients.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
      })),
      steps: recipe.steps.map((step) => ({
        stepNo: step.stepNo,
        content: step.content,
        imageUrl: step.imageUrl ? this.mediaService.signUrls([step.imageUrl])[0] : null,
      })),
      tagIds: recipe.tags.map((item) => item.tagId),
      source: recipe.source,
      nutrition: recipe.nutrition ? toNutritionView(recipe.nutrition) : null,
    }
  }
}
