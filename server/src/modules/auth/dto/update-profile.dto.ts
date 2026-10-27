import { IsOptional, IsString, Length, MaxLength } from 'class-validator'

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 20)
  nickname?: string

  /** 对象存储里的头像 key（先用 /media/upload?purpose=avatar 上传） */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  avatarKey?: string
}
