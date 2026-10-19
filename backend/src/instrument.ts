// Imported first in main.ts, before Nest loads, so Sentry can instrument it (including cron
// jobs). The .env file is read here too, because ConfigModule only reads it later.
import { config } from 'dotenv';
import * as Sentry from '@sentry/nestjs';
import { sentryOptions } from './monitoring/sentry';

config({ quiet: true });

const options = sentryOptions(process.env);
if (options) {
  Sentry.init({
    ...options,
    // Never attach request bodies (passwords, codes, addresses)
    integrations: [
      Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' }),
    ],
  });
}
