import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../storage/storage.interface.js';
import { assertAllowedUpload, maxUploadBytes } from './upload-check.js';

// What a Document row needs from a stored file.
export interface StoredFile {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable()
export class DocumentStorage {
  private readonly maxBytes: number;

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.maxBytes = maxUploadBytes(config);
  }

  // Checks the file again and stores it under a generated key; the user's
  // filename is kept only as metadata.
  async save(
    file: Pick<
      Express.Multer.File,
      'originalname' | 'mimetype' | 'size' | 'buffer'
    >,
  ): Promise<StoredFile> {
    const ext = assertAllowedUpload(file, this.maxBytes);
    const storageKey = `documents/${randomUUID()}.${ext}`;
    await this.storage.put(storageKey, file.buffer, file.mimetype);
    return {
      storageKey,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  // Removes one saved file, e.g. when the transaction that would have
  // recorded it fails. Never delete by prefix (AGENTS.md -> Architecture).
  async remove(storageKey: string): Promise<void> {
    await this.storage.delete(storageKey);
  }
}
