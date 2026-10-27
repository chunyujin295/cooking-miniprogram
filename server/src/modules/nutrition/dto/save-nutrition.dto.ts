import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator'

/** 来自外部 AI 模板的每份营养值，只做范围校验，不做来源推断 */
export class SaveNutritionDto {
  @IsInt()
  @Min(1)
  @Max(5000)
  energyKcal!: number

  @IsNumber()
  @Min(0)
  @Max(500)
  proteinG!: number

  @IsNumber()
  @Min(0)
  @Max(500)
  fatG!: number

  @IsNumber()
  @Min(0)
  @Max(500)
  carbohydrateG!: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  fiberG?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  sodiumMg?: number

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  confidence?: 'low' | 'medium' | 'high'

  /** manual 表示用户手动录入，可直接参与统计；默认沿用模板整理的 external-ai */
  @IsOptional()
  @IsIn(['manual', 'external-ai'])
  origin?: 'manual' | 'external-ai'
}
