import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageDriver } from '../storage/local-storage.driver.js';
import { DocumentStorage } from './document-storage.js';
import { ALLOWED_TYPES } from './upload-check.js';

describe('DocumentStorage (local driver)', () => {
  let uploadDir: string;
  let driver: LocalStorageDriver;
  let documents: DocumentStorage;

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'compel-documents-test-'));
    const values: Record<string, string> = {
      UPLOAD_DIR: uploadDir,
      MAX_UPLOAD_MB: '1',
    };
    const config = {
      get: (name: string) => values[name],
    } as unknown as ConfigService;
    driver = new LocalStorageDriver(config);
    documents = new DocumentStorage(driver, config);
  });

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  function upload(originalname: string, mimetype: string, contents: Buffer) {
    return { originalname, mimetype, size: contents.length, buffer: contents };
  }

  async function read(key: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of await driver.get(key))
      chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  it('stores the file under a generated key and returns the Document fields', async () => {
    const contents = Buffer.from('%PDF-1.4 SYNTHETIC — DEMO DATA');
    const stored = await documents.save(
      upload('طلب مشاركة.pdf', ALLOWED_TYPES.pdf, contents),
    );

    expect(stored).toEqual({
      storageKey: expect.stringMatching(/^documents\/[0-9a-f-]{36}\.pdf$/),
      originalName: 'طلب مشاركة.pdf',
      mimeType: ALLOWED_TYPES.pdf,
      sizeBytes: contents.length,
    });
    expect((await read(stored.storageKey)).equals(contents)).toBe(true);
  });

  it('never uses the original filename in the key, and keys are unique', async () => {
    const f = upload(
      '../../etc/passwd.docx',
      ALLOWED_TYPES.docx,
      Buffer.from('PK'),
    );
    const first = await documents.save(f);
    const second = await documents.save(f);

    expect(first.storageKey).not.toContain('passwd');
    expect(first.storageKey).not.toContain('..');
    expect(first.storageKey).toMatch(/\.docx$/);
    expect(second.storageKey).not.toBe(first.storageKey);
  });

  it('refuses a disallowed or oversized file without storing it', async () => {
    const put = vi.spyOn(driver, 'put');
    await expect(
      documents.save(upload('a.png', 'image/png', Buffer.from('x'))),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      documents.save(
        upload('a.pdf', ALLOWED_TYPES.pdf, Buffer.alloc(1024 * 1024 + 1)),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(put).not.toHaveBeenCalled();
  });

  it('removes exactly one saved file', async () => {
    const a = await documents.save(
      upload('a.pdf', ALLOWED_TYPES.pdf, Buffer.from('a')),
    );
    const b = await documents.save(
      upload('b.pdf', ALLOWED_TYPES.pdf, Buffer.from('b')),
    );

    await documents.remove(a.storageKey);

    await expect(driver.exists(a.storageKey)).resolves.toBe(false);
    await expect(driver.exists(b.storageKey)).resolves.toBe(true);
  });
});
