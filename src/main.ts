import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { SuccessResponseInterceptor } from './interceptors/success-response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string[]>('CORS_ORIGINS', []),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new SuccessResponseInterceptor());
  app.enableShutdownHooks();

  const openApiConfig = new DocumentBuilder()
    .setTitle('Baloot Auth API')
    .setDescription('Reusable authentication and authorization service API')
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('api/docs', app, openApiDocument);

  await app.listen(config.getOrThrow<number>('PORT'));
}

void bootstrap();
