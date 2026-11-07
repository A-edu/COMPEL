import {
  Controller,
  Get,
  Logger,
  Param,
  Res,
  type StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, type SessionUser } from '../auth/session-user.js';
import { documentResponse } from './document-response.js';
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
    return documentResponse(file, res, this.logger);
  }
}
