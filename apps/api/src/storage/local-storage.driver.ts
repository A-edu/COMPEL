import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import type { StorageService } from './storage.interface.js';

@Injectable()
export class LocalStorageDriver implements StorageService {
  private readonly root: string;

  constructor(configService: ConfigService) {
    this.root = resolve(configService.get<string>('UPLOAD_DIR') ?? './uploads');
  }

  private path(key: string): string {
    return join(this.root, key);
  }

  async put(key: string, buffer: Buffer): Promise<void> {
    const filePath = this.path(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
  }

  async get(key: string): Promise<Readable> {
    const buffer = await readFile(this.path(key));
    return Readable.from(buffer);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.path(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}
