// Startup validation for the auth, rate-limit and mail variables
// (AGENTS.md -> Environment variables). The API refuses to start when any of
// them is missing or malformed.

const POSITIVE_INTEGERS = [
  'OTP_TTL_MINUTES',
  'OTP_MAX_ATTEMPTS',
  'OTP_RATE_WINDOW_SECONDS',
  'OTP_RATE_LIMIT_PER_EMAIL',
  'OTP_RATE_LIMIT_PER_IP',
  'SESSION_IDLE_MINUTES',
  'SESSION_ABSOLUTE_HOURS',
] as const;

const REQUIRED_STRINGS = ['OTP_HASH_SECRET', 'MAIL_FROM'] as const;

const SMTP_VARIABLES = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const;

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

export function isSmtpConfigured(config: Record<string, unknown>): boolean {
  return SMTP_VARIABLES.every((name) => !isBlank(config[name]));
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];
  const validated: Record<string, unknown> = { ...config };

  for (const name of REQUIRED_STRINGS) {
    if (isBlank(config[name])) errors.push(`${name} must be set.`);
  }

  for (const name of POSITIVE_INTEGERS) {
    const value = Number(config[name]);
    if (isBlank(config[name]) || !Number.isInteger(value) || value <= 0) {
      errors.push(`${name} must be a positive integer.`);
    } else {
      validated[name] = value;
    }
  }

  if (isSmtpConfigured(config)) {
    const port = Number(config.SMTP_PORT);
    if (!Number.isInteger(port) || port <= 0) {
      errors.push('SMTP_PORT must be a positive integer.');
    } else {
      validated.SMTP_PORT = port;
    }
  } else if (config.NODE_ENV === 'production') {
    errors.push(
      `SMTP is not configured (${SMTP_VARIABLES.join(', ')}); refusing to start in production.`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment:\n- ${errors.join('\n- ')}`);
  }
  return validated;
}
