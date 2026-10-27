import { Type } from 'class-transformer'
import { IsBoolean, IsOptional, IsString, Length, MaxLength } from 'class-validator'

export class ListRecipesQuery {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  keyword?: string

  /** 逗号分隔的标签 id，命中最少一个即可 */
  @IsOptional()
  @IsString()
  tagIds?: string

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeArchived?: boolean
}

export function parseTagIds(raw?: string): string[] {
  if (!raw) {
    return []
  }
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
}

export class CreateTagDto {
  @IsString()
  @Length(1, 20)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  category?: string
}
