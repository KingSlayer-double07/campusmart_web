import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  configureApp(app);

  const port = process.env.PORT ?? 4000;
  const logger = new Logger('Bootstrap');

  // Swagger UI at /api/docs, raw OpenAPI JSON at /api/docs-json (for type generation).
  // Not mounted in production.
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CampusMart API')
      .setDescription('API documentation for CampusMart')
      .setVersion('1.0')
      .addCookieAuth('access_token')
      .addGlobalResponse({
        status: 500,
        description: 'Internal Server Error',
      })
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
    logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
  }

  await app.listen(port);
  logger.log(`Backend running on http://localhost:${port}/api`);
}

void bootstrap();
