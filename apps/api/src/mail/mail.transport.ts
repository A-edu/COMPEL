import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { isSmtpConfigured } from '../config/env.validation.js';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export interface MailTransport {
  sendMail(message: MailMessage): Promise<unknown>;
}

// null means SMTP is not configured: MailService falls back to the console.
// That only happens outside production; env validation refuses to start a
// production API without SMTP.
export const mailTransportProvider = {
  provide: MAIL_TRANSPORT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): MailTransport | null => {
    const env = {
      SMTP_HOST: config.get<string>('SMTP_HOST'),
      SMTP_USER: config.get<string>('SMTP_USER'),
      SMTP_PASS: config.get<string>('SMTP_PASS'),
    };
    if (!isSmtpConfigured(env)) return null;

    const port = config.getOrThrow<number>('SMTP_PORT');
    return createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  },
};
