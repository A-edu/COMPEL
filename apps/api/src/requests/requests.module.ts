import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { RequestScope } from './request-scope.js';
import { RequestsListController } from './requests-list.controller.js';
import { RequestsListService } from './requests-list.service.js';

// Each task adds its own controller and service files here.
@Module({
  imports: [DocumentsModule],
  controllers: [RequestsListController],
  providers: [RequestScope, RequestsListService],
  exports: [RequestScope],
})
export class RequestsModule {}
