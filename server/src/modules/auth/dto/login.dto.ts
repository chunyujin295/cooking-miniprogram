import { IsString, Length } from 'class-validator'

export class LoginDto {
  @IsString()
  @Length(1, 256)
  code!: string
}