import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { loadConfig } from '../../config/env'
import { WechatModule } from '../../infra/wechat/wechat.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

@Module({
  imports: [
    WechatModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: loadConfig().jwtSecret,
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [JwtModule],
})
export class AuthModule {}