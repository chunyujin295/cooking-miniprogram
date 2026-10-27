import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common'
import { map, Observable } from 'rxjs'

export interface SuccessBody<T> {
  code: number
  message: string
  data: T | null
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessBody<T> | StreamableFile> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessBody<T> | StreamableFile> {
    return next.handle().pipe(
      map((data) => {
        // 文件流不能套统一响应体，否则会被当成 JSON 序列化
        if (data instanceof StreamableFile) {
          return data
        }
        return { code: 0, message: 'ok', data: data ?? null }
      }),
    )
  }
}
