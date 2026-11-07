import {
  Controller,
  Get,
  Logger,
  Param,
  Res,
  type StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { OfficerOnly } from '../auth/route-access.js';
import { documentResponse } from './document-response.js';
import { ReviewCaseService, type ReviewCase } from './review-case.service.js';

@OfficerOnly()
@Controller('review/requests')
export class ReviewCaseController {
  private readonly logger = new Logger(ReviewCaseController.name);

  constructor(private readonly cases: ReviewCaseService) {}

  @Get(':id')
  detail(@Param('id') id: string): Promise<ReviewCase> {
    return this.cases.getCase(id);
  }

  @Get(':id/documents/:documentId')
  async download(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.cases.openDocument(id, documentId);
    return documentResponse(file, res, this.logger);
  }
}
