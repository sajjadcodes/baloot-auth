import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { getErrorDetails } from './error.js';

describe('getErrorDetails', () => {
  it('uses a default message for a known HTTP status', () => {
    expect(getErrorDetails(404, new NotFoundException())).toEqual({
      code: 404,
      message: 'Resource not found',
    });
  });

  it('preserves custom HTTP exception messages', () => {
    expect(
      getErrorDetails(400, new BadRequestException('Invalid email')),
    ).toEqual({
      code: 400,
      message: 'Invalid email',
    });
  });

  it('joins validation messages', () => {
    const exception = new BadRequestException({
      message: ['Email is invalid', 'Password is too short'],
    });

    expect(getErrorDetails(400, exception)).toEqual({
      code: 400,
      message: 'Email is invalid, Password is too short',
    });
  });

  it('uses a generic message for unknown 4xx and all 5xx statuses', () => {
    expect(
      getErrorDetails(418, new HttpException('Teapot details', 418)),
    ).toEqual({
      code: 418,
      message: 'Teapot details',
    });
    expect(
      getErrorDetails(503, new HttpException('Database internals', 503)),
    ).toEqual({
      code: 500,
      message: 'Internal server error',
    });
  });
});
