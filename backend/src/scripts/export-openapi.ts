import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { buildOpenApiDocument } from '../openapi';

// Writes the same document GET /api/docs-json serves, without starting the server.
// Usage: npm run openapi:export -- <output.json>
async function main() {
  const out = resolve(process.argv[2] ?? 'openapi.json');
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  configureApp(app);
  writeFileSync(out, JSON.stringify(buildOpenApiDocument(app)));
  await app.close();
  console.log(`OpenAPI document written to ${out}`);
}

void main();
