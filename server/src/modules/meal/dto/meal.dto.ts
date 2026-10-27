import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { MealType } from '@prisma/client'

export class CreateMealSessionDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  mealDate!: string

  @IsEnum(MealType)
  mealType!: MealType
}

export class OrderItemDto {
  @IsString()
  @MaxLength(40)
  recipeId!: string

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number

  /** 多人共享的一道菜，不按个人独占计 */
  @IsOptional()
  @IsBoolean()
  isShared?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(100)
  note?: string
}

export class SaveOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[]
}
