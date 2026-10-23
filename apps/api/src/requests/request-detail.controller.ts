import {
  Controller,
  Get,
  Logger,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, type SessionUser } from '../auth/session-user.js';
import {
  RequestDetailService,
  type RequestDetail,
} from './request-detail.service.js';

@Controller('requests')
export class RequestDetailController {
  private readonly logger = new Logger(RequestDetailController.name);

  constructor(private readonly details: RequestDetailService) {}

  @Get(':id')
  detail(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<RequestDetail> {
    return this.details.getDetail(user, id);
  }

  @Get(':id/documents/:documentId')
  async download(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.details.openDocument(user, id, documentId);
    // Express writes an ASCII fallback plus filename*=UTF-8''… so
    // non-Latin names (e.g. Arabic) survive.
    res.attachment(file.originalName);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const streamable = new StreamableFile(file.stream, {
      type: file.mimeType,
      length: file.sizeBytes,
    });
    // A storage failure mid-stream must not send its message to the client.
    streamable.setErrorHandler((error, response) => {
      this.logger.error(error);
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    });
    return streamable;
  }
}
