import { IsString, Length } from 'class-validator'

export class AcceptInviteDto {
  @IsString()
  @Length(4, 32)
  code!: string
}