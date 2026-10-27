import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import type { AuthUser } from '../decorators/current-user.decorator'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>()
    const header = request.headers.authorization

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('未登录')
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthUser>(header.slice(7))
      request.user = payload
      return true
    } catch {
      throw new UnauthorizedException('登录已失效')
    }
  }
}