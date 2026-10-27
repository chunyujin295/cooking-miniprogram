import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { Response } from 'express'

interface ErrorBody {
  code: number
  message: string
  data: null
}

/** 统一错误响应：区分参数错误、无权限、状态冲突与系统故障 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    let message = '服务器异常'
    if (exception instanceof HttpException) {
      const payload = exception.getResponse()
      message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message?.toString() ?? exception.message)
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack)
    }

    const body: ErrorBody = { code: status, message, data: null }
    response.status(status).json(body)
  }
}