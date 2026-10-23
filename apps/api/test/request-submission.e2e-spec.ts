import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { DocumentStorage } from '../src/documents/document-storage.js';
import {
  ALLOWED_TYPES,
  tooLargeMessage,
  WRONG_TYPE_MESSAGE,
} from '../src/documents/upload-check.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  CHOOSE_PROVIDER,
  TITLE_LENGTH,
} from '../src/requests/dto/create-request.dto.js';
import { REFERENCE_PATTERN } from '../src/requests/reference.js';
import {
  OWN_ENTITY_PROVIDER,
  REQUEST_FORM_REQUIRED,
} from '../src/requests/request-submission.service.js';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../src/storage/storage.interface.js';
import {
  createTestApp,
  envNumber,
  loginAs,
  type MockMailTransport,
  type ResettableThrottlerStorage,
} from './auth-helpers.js';
import { createEntityFixtures, type EntityFixture } from './fixtures.js';

const pdf = Buffer.from('%PDF-1.4 SYNTHETIC — DEMO DATA');
const docx = Buffer.from('PK SYNTHETIC — DEMO DATA');

function sequenceOf(reference: string): number {
  return Number(reference.slice(-6));
}

describe('POST /requests (e2e)', () => {
  const prisma = new PrismaClient();
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let throttler: ResettableThrottlerStorage;
  let storage: StorageService;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;
  let a: EntityFixture;
  let b: EntityFixture;
  let c: EntityFixture;
  let cookieA: string;

  // A complete, valid submission from A; tests change one part of it.
  function submit(
    cookie: string,
    {
      providingEntityId = b.entity.id,
      title = 'Employee health insurance records',
      requestForm = true,
      supporting = 0,
    }: {
      providingEntityId?: string;
      title?: string;
      requestForm?: boolean;
      supporting?: number;
    } = {},
  ) {
    let req = request(app.getHttpServer())
      .post('/api/requests')
      .set('Cookie', cookie)
      .field('providingEntityId', providingEntityId)
      .field('title', title);
    if (requestForm) {
      req = req.attach('requestForm', pdf, {
        filename: 'request-form.pdf',
        contentType: ALLOWED_TYPES.pdf,
      });
    }
    for (let i = 0; i < supporting; i++) {
      req = req.attach('supportingDocuments', docx, {
        filename: `supporting-${i}.docx`,
        contentType: ALLOWED_TYPES.docx,
      });
    }
    return req;
  }

  async function requestCount(): Promise<number> {
    return prisma.dataSharingRequest.count({
      where: { requestingEntityId: a.entity.id },
    });
  }

  beforeAll(async () => {
    ({ app, mail, throttler } = await createTestApp());
    storage = app.get<StorageService>(STORAGE_SERVICE);
    fixtures = await createEntityFixtures(prisma, 3);
    [a, b, c] = fixtures.entities;
    cookieA = await loginAs(app, mail, a.dpo.email);
  });

  afterAll(async () => {
    await fixtures?.cleanup();
    await app?.close();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    throttler.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates the request with its reference, status and documents', async () => {
    const res = await submit(cookieA, {
      title: '  Employee health insurance records  ',
      supporting: 2,
    }).expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      reference: expect.stringMatching(REFERENCE_PATTERN),
      status: 'AWAITING_PROVIDER_RESPONSE',
    });
    expect(res.body.reference.slice(4, 8)).toBe(
      String(new Date().getUTCFullYear()),
    );

    const stored = await prisma.dataSharingRequest.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { documents: { orderBy: { originalName: 'asc' } } },
    });
    expect(stored).toMatchObject({
      reference: res.body.reference,
      title: 'Employee health insurance records',
      status: 'AWAITING_PROVIDER_RESPONSE',
      requestingEntityId: a.entity.id,
      providingEntityId: b.entity.id,
      submittedById: a.dpo.id,
    });
    expect(
      stored.documents.map((d) => [d.kind, d.originalName, d.mimeType]),
    ).toEqual([
      ['REQUEST_FORM', 'request-form.pdf', ALLOWED_TYPES.pdf],
      ['SUPPORTING', 'supporting-0.docx', ALLOWED_TYPES.docx],
      ['SUPPORTING', 'supporting-1.docx', ALLOWED_TYPES.docx],
    ]);
    for (const doc of stored.documents) {
      expect(doc.uploadedById).toBe(a.dpo.id);
      expect(doc.storageKey).not.toContain(doc.originalName);
      await expect(storage.exists(doc.storageKey)).resolves.toBe(true);
    }
  });

  it('gives consecutive submissions consecutive references', async () => {
    const first = await submit(cookieA).expect(201);
    const second = await submit(cookieA).expect(201);
    expect(sequenceOf(second.body.reference)).toBe(
      sequenceOf(first.body.reference) + 1,
    );
  });

  it('gives concurrent submissions unique references', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        submit(cookieA, { title: `Concurrent request ${i}` }),
      ),
    );
    for (const res of results) expect(res.status).toBe(201);

    const references = results.map((res) => res.body.reference as string);
    for (const reference of references) {
      expect(reference).toMatch(REFERENCE_PATTERN);
    }
    expect(new Set(references).size).toBe(references.length);
  });

  it('takes the requesting entity from the session, not the body', async () => {
    const res = await submit(cookieA)
      .field('requestingEntityId', c.entity.id)
      .field('submittedById', c.dpo.id)
      .expect(201);
    const stored = await prisma.dataSharingRequest.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(stored.requestingEntityId).toBe(a.entity.id);
    expect(stored.submittedById).toBe(a.dpo.id);
  });

  it.each([
    [
      "one's own entity as provider",
      () => ({ providingEntityId: a.entity.id }),
      OWN_ENTITY_PROVIDER,
    ],
    [
      'an unknown provider',
      () => ({ providingEntityId: 'no-such-entity' }),
      CHOOSE_PROVIDER,
    ],
    ['no provider', () => ({ providingEntityId: '' }), CHOOSE_PROVIDER],
    [
      'a missing request form',
      () => ({ requestForm: false }),
      REQUEST_FORM_REQUIRED,
    ],
    ['a title under 5 characters', () => ({ title: 'Abcd' }), TITLE_LENGTH],
    [
      'a title that is only 4 characters once trimmed',
      () => ({ title: '   Abcd   ' }),
      TITLE_LENGTH,
    ],
    [
      'a title over 120 characters',
      () => ({ title: 'x'.repeat(121) }),
      TITLE_LENGTH,
    ],
    [
      'more than 5 supporting documents',
      () => ({ supporting: 6 }),
      'At most 5 files are allowed in supportingDocuments.',
    ],
  ])(
    'returns 400 for %s and stores nothing',
    async (_case, change, message) => {
      const save = vi.spyOn(app.get(DocumentStorage), 'save');
      const before = await requestCount();

      const res = await submit(cookieA, change()).expect(400);

      expect(res.body).toEqual({ message });
      expect(save).not.toHaveBeenCalled();
      expect(await requestCount()).toBe(before);
    },
  );

  it('accepts exactly 5 supporting documents and a 120-character title', async () => {
    await submit(cookieA, { supporting: 5, title: 'x'.repeat(120) }).expect(
      201,
    );
  });

  it('returns 400 for a wrong file type', async () => {
    const before = await requestCount();
    const res = await request(app.getHttpServer())
      .post('/api/requests')
      .set('Cookie', cookieA)
      .field('providingEntityId', b.entity.id)
      .field('title', 'Wrong file type')
      .attach('requestForm', Buffer.from('x'), {
        filename: 'form.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(res.body).toEqual({ message: WRONG_TYPE_MESSAGE });
    expect(await requestCount()).toBe(before);
  });

  it('returns 400 for an oversized file', async () => {
    const maxBytes = envNumber('MAX_UPLOAD_MB') * 1024 * 1024;
    const before = await requestCount();
    const res = await request(app.getHttpServer())
      .post('/api/requests')
      .set('Cookie', cookieA)
      .field('providingEntityId', b.entity.id)
      .field('title', 'Oversized file')
      .attach('requestForm', pdf, {
        filename: 'request-form.pdf',
        contentType: ALLOWED_TYPES.pdf,
      })
      .attach('supportingDocuments', Buffer.alloc(maxBytes + 1), {
        filename: 'big.pdf',
        contentType: ALLOWED_TYPES.pdf,
      })
      .expect(400);
    expect(res.body).toEqual({ message: tooLargeMessage(maxBytes) });
    expect(await requestCount()).toBe(before);
  });

  it('removes the stored files when the transaction fails', async () => {
    const documents = app.get(DocumentStorage);
    const save = vi.spyOn(documents, 'save');
    vi.spyOn(app.get(PrismaService), '$transaction').mockRejectedValueOnce(
      new Error('Simulated database failure'),
    );
    const before = await requestCount();

    await submit(cookieA, { supporting: 2 }).expect(500);

    expect(save).toHaveBeenCalledTimes(3);
    for (const result of save.mock.results) {
      const { storageKey } = (await result.value) as { storageKey: string };
      await expect(storage.exists(storageKey)).resolves.toBe(false);
    }
    expect(await requestCount()).toBe(before);
  });

  it('returns 401 without a session', async () => {
    await request(app.getHttpServer())
      .post('/api/requests')
      .field('providingEntityId', b.entity.id)
      .field('title', 'No session')
      .expect(401);
  });
});
