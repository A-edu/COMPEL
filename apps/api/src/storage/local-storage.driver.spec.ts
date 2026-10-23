import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageDriver } from './local-storage.driver.js';
import type { StorageService } from './storage.interface.js';

describe('LocalStorageDriver', () => {
  let uploadDir: string;
  let driver: StorageService;

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'compel-storage-test-'));
    const configService = { get: () => uploadDir } as unknown as ConfigService;
    driver = new LocalStorageDriver(configService);
  });

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('round-trips a file through put/get/exists/delete', async () => {
    const key = 'some/nested/key.pdf';
    const contents = Buffer.from('SYNTHETIC — DEMO DATA');

    await expect(driver.exists(key)).resolves.toBe(false);

    await driver.put(key, contents, 'application/pdf');
    await expect(driver.exists(key)).resolves.toBe(true);

    const stream = await driver.get(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).equals(contents)).toBe(true);

    await driver.delete(key);
    await expect(driver.exists(key)).resolves.toBe(false);
  });
});
