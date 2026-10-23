import { Controller, Post, UploadedFiles } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import {
  DocumentStorage,
  type StoredFile,
} from '../src/documents/document-storage.js';
import { DocumentsModule } from '../src/documents/documents.module.js';
import {
  ALLOWED_TYPES,
  DocumentUpload,
  tooLargeMessage,
  type UploadedFields,
  WRONG_TYPE_MESSAGE,
} from '../src/documents/upload-check.js';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../src/storage/storage.interface.js';

const MAX_BYTES = 1024 * 1024;

// Exercises @DocumentUpload and DocumentStorage the way §9 and §10 will.
@Controller('upload-test')
class UploadTestController {
  constructor(private readonly documents: DocumentStorage) {}

  @Post()
  @DocumentUpload([
    { name: 'form', maxCount: 1 },
    { name: 'extra', maxCount: 2 },
  ])
  async upload(@UploadedFiles() files: UploadedFields): Promise<StoredFile[]> {
    const all = [...(files.form ?? []), ...(files.extra ?? [])];
    const stored: StoredFile[] = [];
    for (const file of all) stored.push(await this.documents.save(file));
    return stored;
  }
}

describe('Document upload (e2e)', () => {
  let app: NestExpressApplication;
  let storage: StorageService;
  const saved: string[] = [];

  const pdf = Buffer.from('%PDF-1.4 SYNTHETIC — DEMO DATA');
  const post = () => request(app.getHttpServer()).post('/api/upload-test');

  beforeAll(async () => {
    const values: Record<string, string> = { MAX_UPLOAD_MB: '1' };
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DocumentsModule,
      ],
      controllers: [UploadTestController],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: (name: string) => values[name] ?? process.env[name] })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    storage = app.get<StorageService>(STORAGE_SERVICE);
  });

  afterAll(async () => {
    for (const key of saved) await storage?.delete(key);
    await app?.close();
  });

  function keep(res: request.Response): StoredFile[] {
    const body = res.body as StoredFile[];
    saved.push(...body.map((f) => f.storageKey));
    return body;
  }

  it('accepts PDF and DOCX files and keeps non-Latin filenames', async () => {
    const res = await post()
      .attach('form', pdf, {
        filename: 'طلب مشاركة.pdf',
        contentType: ALLOWED_TYPES.pdf,
      })
      .attach('extra', Buffer.from('PK'), {
        filename: 'notes.docx',
        contentType: ALLOWED_TYPES.docx,
      })
      .expect(201);
    const [form, extra] = keep(res);

    expect(form).toMatchObject({
      originalName: 'طلب مشاركة.pdf',
      mimeType: ALLOWED_TYPES.pdf,
      sizeBytes: pdf.length,
    });
    expect(extra.originalName).toBe('notes.docx');
    await expect(storage.exists(form.storageKey)).resolves.toBe(true);
  });

  it('returns 400 for a disallowed type', async () => {
    const res = await post()
      .attach('form', Buffer.from('x'), {
        filename: 'a.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(res.body).toEqual({ message: WRONG_TYPE_MESSAGE });
  });

  it('returns 400, not 413, for an oversized file', async () => {
    const res = await post()
      .attach('form', Buffer.alloc(MAX_BYTES + 1), {
        filename: 'big.pdf',
        contentType: ALLOWED_TYPES.pdf,
      })
      .expect(400);
    expect(res.body).toEqual({ message: tooLargeMessage(MAX_BYTES) });
  });

  it('returns 400 for more files than a field allows', async () => {
    let req = post();
    for (let i = 0; i < 3; i++) {
      req = req.attach('extra', pdf, {
        filename: `${i}.pdf`,
        contentType: ALLOWED_TYPES.pdf,
      });
    }
    const res = await req.expect(400);
    expect(res.body).toEqual({
      message: 'At most 2 files are allowed in extra.',
    });
  });

  it('returns 400 for an unexpected file field', async () => {
    const res = await post()
      .attach('other', pdf, {
        filename: 'a.pdf',
        contentType: ALLOWED_TYPES.pdf,
      })
      .expect(400);
    expect(res.body).toEqual({ message: expect.any(String) });
  });
});
