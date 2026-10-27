import { IsArray, IsOptional, IsString, ArrayMaxSize, MaxLength } from 'class-validator'

export class UpdateDietaryDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  allergens?: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  avoidances?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(100)
  note?: string
}
