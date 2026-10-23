import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { RequestScope } from './request-scope.js';

// Each task adds its own controller and service files here.
@Module({
  imports: [DocumentsModule],
  controllers: [],
  providers: [RequestScope],
  exports: [RequestScope],
})
export class RequestsModule {}
