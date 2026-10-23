import { Body, Controller, Post, UploadedFiles } from '@nestjs/common';
import { CurrentUser, type SessionUser } from '../auth/session-user.js';
import {
  DocumentUpload,
  type UploadedFields,
} from '../documents/upload-check.js';
import { CreateRequestDto } from './dto/create-request.dto.js';
import {
  RequestSubmissionService,
  type SubmittedRequest,
} from './request-submission.service.js';

@Controller('requests')
export class RequestSubmissionController {
  constructor(private readonly submissions: RequestSubmissionService) {}

  @Post()
  @DocumentUpload([
    { name: 'requestForm', maxCount: 1 },
    { name: 'supportingDocuments', maxCount: 5 },
  ])
  submit(
    @CurrentUser() user: SessionUser,
    @Body() body: CreateRequestDto,
    @UploadedFiles() files: UploadedFields | undefined,
  ): Promise<SubmittedRequest> {
    return this.submissions.submit(user, body, files ?? {});
  }
}
