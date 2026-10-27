import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateRecipeImportDto {
  @IsIn(['text', 'url'])
  sourceType!: 'text' | 'url'

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  text?: string
}

export class LinkRecipeDto {
  @IsString()
  @MaxLength(64)
  recipeId!: string
}
