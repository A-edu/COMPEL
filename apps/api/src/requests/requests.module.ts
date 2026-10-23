import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { RequestDetailController } from './request-detail.controller.js';
import { RequestDetailService } from './request-detail.service.js';
import { RequestResponseController } from './request-response.controller.js';
import { RequestResponseService } from './request-response.service.js';
import { RequestScope } from './request-scope.js';
import { RequestSubmissionController } from './request-submission.controller.js';
import { RequestSubmissionService } from './request-submission.service.js';
import { RequestsListController } from './requests-list.controller.js';
import { RequestsListService } from './requests-list.service.js';

// Each task adds its own controller and service files here.
@Module({
  // StorageModule.register() is memoized, so this is the app's one driver;
  // downloads read files through it.
  imports: [DocumentsModule, StorageModule.register()],
  controllers: [
    RequestsListController,
    RequestSubmissionController,
    RequestDetailController,
    RequestResponseController,
  ],
  providers: [
    RequestScope,
    RequestsListService,
    RequestSubmissionService,
    RequestDetailService,
    RequestResponseService,
  ],
  exports: [RequestScope],
})
export class RequestsModule {}
