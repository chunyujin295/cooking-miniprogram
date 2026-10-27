import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

export class RecipeIngredientDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string

  @IsString()
  @MaxLength(20)
  quantity!: string

  @IsString()
  @MaxLength(20)
  unit!: string
}

export class RecipeStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content!: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageUrl?: string
}

export class CreateRecipeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsInt()
  @Min(1)
  @Max(20)
  baseServings!: number

  @IsInt()
  @Min(0)
  @Max(1440)
  prepMinutes!: number

  @IsInt()
  @Min(0)
  @Max(1440)
  cookMinutes!: number

  /** 时令菜供应月份 1-12，空表示不限 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(12, { each: true })
  seasonMonths?: number[]

  /** 数据来源，仅新建时生效：手动录入 或 外部 AI 按模板整理 */
  @IsOptional()
  @IsIn(['manual', 'external-ai'])
  source?: 'manual' | 'external-ai'

  /** 图片对象存储 key，数量不设上限 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[]

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients!: RecipeIngredientDto[]

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeStepDto)
  steps!: RecipeStepDto[]
}
