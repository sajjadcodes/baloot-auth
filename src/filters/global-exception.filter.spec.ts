import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { GlobalExceptionFilter } from './global-exception.filter.js';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  let response: {
    status: jest.Mock;
    json: jest.Mock;
  };

  let host: {
    switchToHttp: jest.Mock;
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter = new GlobalExceptionFilter();

    response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    host = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(response),
      }),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('unknown errors', () => {
    it('should return 500 for a normal Error', () => {
      filter.catch(
        new Error('Database connection failed'),
        host as unknown as ArgumentsHost,
      );

      expect(response.status).toHaveBeenCalledWith(500);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 500,
        message: 'Internal server error',
      });
    });

    it('should return 500 for an unknown thrown value', () => {
      filter.catch('something went wrong', host as unknown as ArgumentsHost);

      expect(response.status).toHaveBeenCalledWith(500);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 500,
        message: 'Internal server error',
      });
    });

    it('should return 500 for null', () => {
      filter.catch(null, host as unknown as ArgumentsHost);

      expect(response.status).toHaveBeenCalledWith(500);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 500,
        message: 'Internal server error',
      });
    });
  });

  describe('400 Bad Request', () => {
    it('should use the default message', () => {
      filter.catch(new BadRequestException(), host as unknown as ArgumentsHost);

      expect(response.status).toHaveBeenCalledWith(400);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 400,
        message: 'Bad request',
      });
    });

    it('should use the custom message', () => {
      filter.catch(
        new BadRequestException('Invalid email'),
        host as unknown as ArgumentsHost,
      );

      expect(response.status).toHaveBeenCalledWith(400);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 400,
        message: 'Invalid email',
      });
    });
  });

  describe('401 Unauthorized', () => {
    it('should use the default message', () => {
      filter.catch(
        new UnauthorizedException(),
        host as unknown as ArgumentsHost,
      );

      expect(response.status).toHaveBeenCalledWith(401);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 401,
        message: 'Unauthorized',
      });
    });

    it('should use the custom message', () => {
      filter.catch(
        new UnauthorizedException('Invalid credentials'),
        host as unknown as ArgumentsHost,
      );

      expect(response.status).toHaveBeenCalledWith(401);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 401,
        message: 'Invalid credentials',
      });
    });
  });

  describe('403 Forbidden', () => {
    it('should use the default message', () => {
      filter.catch(new ForbiddenException(), host as unknown as ArgumentsHost);

      expect(response.status).toHaveBeenCalledWith(403);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 403,
        message: 'Forbidden',
      });
    });

    it('should use the custom message', () => {
      filter.catch(
        new ForbiddenException('Access denied'),
        host as unknown as ArgumentsHost,
      );

      expect(response.status).toHaveBeenCalledWith(403);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 403,
        message: 'Access denied',
      });
    });
  });

  describe('404 Not Found', () => {
    it('should use the default message', () => {
      filter.catch(new NotFoundException(), host as unknown as ArgumentsHost);

      expect(response.status).toHaveBeenCalledWith(404);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 404,
        message: 'Resource not found',
      });
    });

    it('should use the custom message', () => {
      filter.catch(
        new NotFoundException('User not found'),
        host as unknown as ArgumentsHost,
      );

      expect(response.status).toHaveBeenCalledWith(404);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 404,
        message: 'User not found',
      });
    });
  });

  describe('409 Conflict', () => {
    it('should use the default message', () => {
      filter.catch(new ConflictException(), host as unknown as ArgumentsHost);

      expect(response.status).toHaveBeenCalledWith(409);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 409,
        message: 'Conflict',
      });
    });

    it('should use the custom message', () => {
      filter.catch(
        new ConflictException('Email already exists'),
        host as unknown as ArgumentsHost,
      );

      expect(response.status).toHaveBeenCalledWith(409);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 409,
        message: 'Email already exists',
      });
    });
  });

  describe('422 Unprocessable Entity', () => {
    it('should use the default message', () => {
      filter.catch(
        new UnprocessableEntityException(),
        host as unknown as ArgumentsHost,
      );

      expect(response.status).toHaveBeenCalledWith(422);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 422,
        message: 'Validation failed',
      });
    });

    it('should use the custom message', () => {
      filter.catch(
        new UnprocessableEntityException('Validation failed'),
        host as unknown as ArgumentsHost,
      );

      expect(response.status).toHaveBeenCalledWith(422);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 422,
        message: 'Validation failed',
      });
    });
  });

  describe('unknown 4xx status', () => {
    it('should use the status as the code', () => {
      const exception = new HttpException('Something unusual happened', 418);

      filter.catch(exception, host as unknown as ArgumentsHost);

      expect(response.status).toHaveBeenCalledWith(418);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 418,
        message: 'Something unusual happened',
      });
    });

    it('should use the default message when no custom message exists', () => {
      const exception = new HttpException(
        {
          error: 'Teapot',
        },
        418,
      );

      filter.catch(exception, host as unknown as ArgumentsHost);

      expect(response.status).toHaveBeenCalledWith(418);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 418,
        message: 'Request failed',
      });
    });
  });

  describe('unknown 5xx status', () => {
    it('should convert unknown 5xx errors to 500', () => {
      const exception = new HttpException('Database error', 503);

      filter.catch(exception, host as unknown as ArgumentsHost);

      expect(response.status).toHaveBeenCalledWith(500);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 500,
        message: 'Internal server error',
      });
    });
  });

  describe('validation errors', () => {
    it('should join validation messages into one string', () => {
      const exception = new BadRequestException({
        message: [
          'email must be an email',
          'password must be longer than or equal to 8 characters',
        ],
        error: 'Bad Request',
        statusCode: 400,
      });

      filter.catch(exception, host as unknown as ArgumentsHost);

      expect(response.status).toHaveBeenCalledWith(400);

      expect(response.json).toHaveBeenCalledWith({
        success: false,
        code: 400,
        message:
          'email must be an email, password must be longer than or equal to 8 characters',
      });
    });
  });

  describe('response behavior', () => {
    it('should always return success: false', () => {
      filter.catch(
        new NotFoundException('Test error'),
        host as unknown as ArgumentsHost,
      );

      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
      );
    });

    it('should call response.status before response.json', () => {
      filter.catch(
        new NotFoundException('Test error'),
        host as unknown as ArgumentsHost,
      );

      const statusOrder = response.status.mock.invocationCallOrder[0];
      const jsonOrder = response.json.mock.invocationCallOrder[0];

      expect(statusOrder).toBeLessThan(jsonOrder);
    });
  });
});
