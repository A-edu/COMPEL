import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from './common/http-exception.filter.js';

// Proxies in front of the API whose X-Forwarded-For entries are trusted when
// computing req.ip. Measured in the workspace through the public dev URL:
// Next.js connects from 127.0.0.1 and X-Forwarded-For arrives as
// "<client>, <replit proxy>, 127.0.0.1", with any client-supplied value
// replaced by Replit. Three hops therefore yields the client address.
export const TRUST_PROXY_HOPS = 3;

// Shared by main.ts and the e2e tests, so tests run the real setup.
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('api');
  app.set('trust proxy', TRUST_PROXY_HOPS);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => {
        const first = errors[0];
        const message = first?.constraints
          ? Object.values(first.constraints)[0]
          : 'Invalid request.';
        return new BadRequestException(message);
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
}
