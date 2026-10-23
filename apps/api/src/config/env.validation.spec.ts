import { validateEnv } from './env.validation.js';

const base = {
  OTP_HASH_SECRET: 'secret',
  MAIL_FROM: 'COMPEL <no-reply@compel.example>',
  OTP_TTL_MINUTES: '5',
  OTP_MAX_ATTEMPTS: '5',
  OTP_RATE_WINDOW_SECONDS: '600',
  OTP_RATE_LIMIT_PER_EMAIL: '5',
  OTP_RATE_LIMIT_PER_IP: '30',
  SESSION_IDLE_MINUTES: '15',
  SESSION_ABSOLUTE_HOURS: '8',
};
const smtp = {
  SMTP_HOST: 'smtp.ethereal.email',
  SMTP_PORT: '587',
  SMTP_USER: 'user',
  SMTP_PASS: 'pass',
};

describe('validateEnv', () => {
  it('parses numeric variables', () => {
    expect(validateEnv({ ...base, ...smtp })).toMatchObject({
      OTP_RATE_WINDOW_SECONDS: 600,
      SMTP_PORT: 587,
    });
  });

  it('allows missing SMTP outside production (console fallback)', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'development' }),
    ).not.toThrow();
  });

  it('refuses to start in production without SMTP', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /SMTP is not configured/,
    );
  });

  it('rejects a missing or non-numeric rate-limit variable', () => {
    const { OTP_RATE_LIMIT_PER_IP: _omit, ...rest } = base;
    expect(() => validateEnv({ ...rest, ...smtp })).toThrow(
      /OTP_RATE_LIMIT_PER_IP/,
    );
    expect(() =>
      validateEnv({ ...base, ...smtp, OTP_RATE_WINDOW_SECONDS: 'ten' }),
    ).toThrow(/OTP_RATE_WINDOW_SECONDS/);
  });
});
