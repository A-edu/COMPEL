import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service.js';
import type { MailMessage, MailTransport } from './mail.transport.js';

function setup(env: Record<string, string>) {
  const sent: MailMessage[] = [];
  const transport: MailTransport = {
    sendMail: (message) => {
      sent.push(message);
      return Promise.resolve({});
    },
  };
  const config = new ConfigService({
    MAIL_FROM: 'COMPEL <no-reply@compel.example>',
    ...env,
  });
  return { sent, mail: new MailService(transport, config) };
}

describe('MailService', () => {
  it('sends the login code with its validity and nothing else', () => {
    const { sent, mail } = setup({});
    mail.sendLoginCode('dpo@moh.example', '012345', 5);
    expect(sent).toEqual([
      {
        from: 'COMPEL <no-reply@compel.example>',
        to: 'dpo@moh.example',
        subject: 'Your COMPEL login code',
        text: '012345\n\nThis code is valid for 5 minutes.\n',
      },
    ]);
  });

  it('redirects every email when MAIL_REDIRECT_TO is set', () => {
    const { sent, mail } = setup({ MAIL_REDIRECT_TO: 'team@compel.example' });
    mail.sendLoginCode('dpo@moh.example', '012345', 5);
    expect(sent[0].to).toBe('team@compel.example');
  });
});
