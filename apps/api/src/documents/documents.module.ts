import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentStorage } from './document-storage.js';

@Module({
  imports: [StorageModule.register()],
  providers: [DocumentStorage],
  exports: [DocumentStorage],
})
export class DocumentsModule {}
