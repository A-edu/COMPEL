import { DynamicModule, Module } from '@nestjs/common';
import { STORAGE_SERVICE } from './storage.interface.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import { ReplitStorageDriver } from './replit-storage.driver.js';

@Module({})
export class StorageModule {
  private static registered?: DynamicModule;

  // Memoized: AppModule and DocumentsModule both import it, and Nest tells
  // dynamic modules apart by reference, so this keeps one driver instance.
  static register(): DynamicModule {
    if (StorageModule.registered) return StorageModule.registered;
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

    StorageModule.registered = {
      module: StorageModule,
      providers: [{ provide: STORAGE_SERVICE, useClass }],
      exports: [STORAGE_SERVICE],
    };
    return StorageModule.registered;
  }
}
