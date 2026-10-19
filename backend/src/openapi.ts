import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ErrorResponseDto } from './common/swagger/error-response.dto';

// The OpenAPI document is the source of truth for frontend types (D5). main.ts serves it at
// /api/docs-json; scripts/export-openapi.ts writes it to a file for the CI freshness check.
export function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('CampusMart API')
    .setDescription(
      'Success responses are wrapped as { success: true, data, timestamp }; errors use ErrorResponseDto.',
    )
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .addGlobalResponse({
      status: 500,
      description: 'Internal Server Error',
      type: ErrorResponseDto,
    })
    .build();

  return SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorResponseDto],
    // Stable operationIds (e.g. AuthController_login) keep the generated file diff-friendly
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey}_${methodKey}`,
  });
}
