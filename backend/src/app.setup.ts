import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Application } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

// Shared by main.ts and the e2e tests, so tests exercise the same pipeline as the real server.
export function configureApp(app: INestApplication) {
  app.use(helmet()); // Basic security headers
  // Real client IP behind the Next proxy (used by the rate limiter and the sessions list)
  (app.getHttpAdapter().getInstance() as Application).set('trust proxy', 1);

  // Parse cookies from incoming requests — required for HTTP-only JWT cookie
  app.use(cookieParser());

  // Global prefix so all routes are /api/...
  app.setGlobalPrefix('api');

  // Reject any request body that contains fields not in the DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // throw if unknown properties are sent
      transform: true, // auto-transform primitives (e.g. string → number)
    }),
  );

  // Every error leaves as { statusCode, code, message, details?, path, timestamp }
  app.useGlobalFilters(new AllExceptionsFilter());

  // Every success leaves as { success: true, data, timestamp }
  app.useGlobalInterceptors(new TransformInterceptor());

  // Browsers only call the API through the Next.js proxy (D1). CORS stays for Swagger and local tools.
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
}
