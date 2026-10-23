import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { RequestScope } from './request-scope.js';
import { RequestSubmissionController } from './request-submission.controller.js';
import { RequestSubmissionService } from './request-submission.service.js';
import { RequestsListController } from './requests-list.controller.js';
import { RequestsListService } from './requests-list.service.js';

// Each task adds its own controller and service files here.
@Module({
  imports: [DocumentsModule],
  controllers: [RequestsListController, RequestSubmissionController],
  providers: [RequestScope, RequestsListService, RequestSubmissionService],
  exports: [RequestScope],
})
export class RequestsModule {}
