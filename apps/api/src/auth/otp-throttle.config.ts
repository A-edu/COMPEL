import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { normalizeEmail } from './auth.crypto.js';

export const RATE_LIMIT_MESSAGE =
  'Too many attempts. Please wait a few minutes and try again.';

function bodyEmail(req: Record<string, any>): unknown {
  return req.body?.email;
}

// Two named throttlers, both applied to otp/request and otp/verify (each
// endpoint counts separately): one per normalised email, so rotating IPs does
// not help, and one per client IP, set higher so DPOs sharing an office IP
// do not block each other.
export function otpThrottleOptions(
  config: ConfigService,
): ThrottlerModuleOptions {
  const ttl = config.getOrThrow<number>('OTP_RATE_WINDOW_SECONDS') * 1000;
  return {
    errorMessage: RATE_LIMIT_MESSAGE,
    throttlers: [
      {
        name: 'email',
        ttl,
        limit: config.getOrThrow<number>('OTP_RATE_LIMIT_PER_EMAIL'),
        // A body without an email fails validation (400); only the IP
        // throttler counts it.
        skipIf: (context: ExecutionContext) =>
          typeof bodyEmail(context.switchToHttp().getRequest()) !== 'string',
        getTracker: (req) => normalizeEmail(bodyEmail(req) as string),
      },
      {
        name: 'ip',
        ttl,
        limit: config.getOrThrow<number>('OTP_RATE_LIMIT_PER_IP'),
      },
    ],
  };
}
