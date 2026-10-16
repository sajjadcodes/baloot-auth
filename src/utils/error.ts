import { HttpException } from '@nestjs/common';

// Utility function for extracting error details from HttpException instances.
export function getErrorDetails(
  status: number,
  exception: HttpException,
): {
  code: number;
  message: string;
} {
  const customMessage = getCustomMessage(exception);

  switch (status) {
    case 400:
      return {
        code: 400,
        message: customMessage ?? 'Bad request',
      };

    case 401:
      return {
        code: 401,
        message: customMessage ?? 'Unauthorized',
      };

    case 403:
      return {
        code: 403,
        message: customMessage ?? 'Forbidden',
      };

    case 404:
      return {
        code: 404,
        message: customMessage ?? 'Resource not found',
      };

    case 409:
      return {
        code: 409,
        message: customMessage ?? 'Conflict',
      };

    case 422:
      return {
        code: 422,
        message: customMessage ?? 'Validation failed',
      };

    default:
      if (status >= 400 && status < 500) {
        return {
          code: status,
          message: customMessage ?? 'Request failed',
        };
      }

      return {
        code: 500,
        message: 'Internal server error',
      };
  }
}

// Utility function to extract a custom message from an HttpException instance.
function getCustomMessage(exception: HttpException): string | undefined {
  const error = exception.getResponse();

  if (typeof error === 'string') {
    return isDefaultMessage(exception, error) ? undefined : error;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: string | string[] }).message;

    if (Array.isArray(message)) {
      return message.join(', ');
    }

    return message && isDefaultMessage(exception, message)
      ? undefined
      : message;
  }

  return undefined;
}

// Utility function to determine if a message is the default message for an HttpException instance.
function isDefaultMessage(exception: HttpException, message: string) {
  const phrase = exception.name
    .replace(/Exception$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2');

  return message === phrase;
}
