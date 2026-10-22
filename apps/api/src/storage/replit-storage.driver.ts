import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@replit/object-storage';
import type { Readable } from 'node:stream';
import type { StorageService } from './storage.interface.js';

@Injectable()
export class ReplitStorageDriver implements StorageService {
  private readonly client = new Client();
  private readonly prefix: string;

  constructor(configService: ConfigService) {
    this.prefix = configService.get<string>('STORAGE_PREFIX') ?? 'dev';
  }

  private key(key: string): string {
    return `${this.prefix}/${key}`;
  }

  async put(key: string, buffer: Buffer): Promise<void> {
    const result = await this.client.uploadFromBytes(this.key(key), buffer);
    if (!result.ok) {
      throw new Error(`Failed to upload "${key}": ${result.error.message}`);
    }
  }

  async get(key: string): Promise<Readable> {
    return this.client.downloadAsStream(this.key(key));
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(this.key(key));
    if (!result.ok) {
      throw new Error(`Failed to check "${key}": ${result.error.message}`);
    }
    return result.value;
  }

  async delete(key: string): Promise<void> {
    const result = await this.client.delete(this.key(key));
    if (!result.ok) {
      throw new Error(`Failed to delete "${key}": ${result.error.message}`);
    }
  }
}
