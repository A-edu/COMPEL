import { Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { mailTransportProvider } from './mail.transport.js';

@Module({
  providers: [mailTransportProvider, MailService],
  exports: [MailService],
})
export class MailModule {}
