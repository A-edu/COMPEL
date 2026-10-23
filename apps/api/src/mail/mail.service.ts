import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_TRANSPORT, type MailTransport } from './mail.transport.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport | null,
    private readonly config: ConfigService,
  ) {}

  // Fire-and-forget: the caller never waits on SMTP, so response time does
  // not reveal whether an account exists. Failures are logged without the
  // code.
  sendLoginCode(to: string, code: string, validMinutes: number): void {
    // Safety switch (AGENTS.md -> Email): when set, every email goes here.
    const recipient = this.config.get<string>('MAIL_REDIRECT_TO') || to;

    if (!this.transport) {
      // Dev-only console fallback (AGENTS.md -> Email); production refuses
      // to start without SMTP.
      this.logger.warn(
        `SMTP not configured. Login code for ${recipient}: ${code}`,
      );
      return;
    }

    this.transport
      .sendMail({
        from: this.config.getOrThrow<string>('MAIL_FROM'),
        to: recipient,
        subject: 'Your COMPEL login code',
        text: `${code}\n\nThis code is valid for ${validMinutes} minutes.\n`,
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : 'unknown error';
        this.logger.error(
          `Failed to send login code email to ${recipient}: ${reason}`,
        );
      });
  }
}
