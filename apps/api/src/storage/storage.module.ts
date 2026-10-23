import { DynamicModule, Module } from '@nestjs/common';
import { STORAGE_SERVICE } from './storage.interface.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import { ReplitStorageDriver } from './replit-storage.driver.js';

@Module({})
export class StorageModule {
  static register(): DynamicModule {
    const driver = process.env.STORAGE_DRIVER;

    let useClass: typeof LocalStorageDriver | typeof ReplitStorageDriver;
    if (driver === 'local') {
      useClass = LocalStorageDriver;
    } else if (driver === 'replit') {
      useClass = ReplitStorageDriver;
    } else {
      throw new Error(
        `Unknown STORAGE_DRIVER: "${driver}". Expected "local" or "replit".`,
      );
    }

    return {
      module: StorageModule,
      providers: [{ provide: STORAGE_SERVICE, useClass }],
      exports: [STORAGE_SERVICE],
    };
  }
}
