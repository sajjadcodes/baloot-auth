import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ErrorResponse } from '../types/success-response.interface';
import { getErrorDetails } from '../utils/error';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();

    let errorResponse: ErrorResponse = {
      success: false,
      code: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };

    if (exception instanceof HttpException) {
      const result = getErrorDetails(exception.getStatus(), exception);
      if (result.code >= 500) {
        this.logger.error(`Unhandled HTTP exception (${exception.name})`);
      }
      errorResponse = {
        success: false,
        code: result.code,
        message: result.message,
      };
    } else {
      this.logger.error(
        `Unhandled exception (${exception instanceof Error ? exception.name : 'non-Error value'})`,
      );
    }

    response.status(errorResponse.code).json(errorResponse);
  }
}
