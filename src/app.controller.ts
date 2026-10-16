import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Application')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Check that the service is running' })
  @ApiOkResponse({
    description: 'The service is running',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        code: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Successful request!' },
        data: { type: 'string', example: 'Hello World!' },
      },
    },
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
