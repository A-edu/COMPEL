import type { Readable } from 'node:stream';

export interface StorageService {
  put(key: string, buffer: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
