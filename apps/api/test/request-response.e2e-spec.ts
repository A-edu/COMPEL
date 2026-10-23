import type { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { type Prisma, PrismaClient } from '@prisma/client';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RequestScope } from '../src/requests/request-scope.js';
import { buildPlaceholderPdf } from '../src/seed/placeholder-pdf.js';
import { LocalStorageDriver } from '../src/storage/local-storage.driver.js';
import type { StorageService } from '../src/storage/storage.interface.js';
import {
  createTestApp,
  loginAs,
  type MockMailTransport,
  type ResettableThrottlerStorage,
} from './auth-helpers.js';
import {
  createEntityFixtures,
  createTestRequest,
  type EntityFixture,
} from './fixtures.js';

const ROPA_PDF = buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', 'RoPA entry']);
const REASON = 'The legal basis for sharing is not stated.';

interface ResponseFields {
  position?: string;
  objectionReason?: string;
  file?: { buffer: Buffer; filename: string; contentType: string } | null;
  extra?: Record<string, string>;
}

describe('POST /requests/:id/response (e2e)', () => {
  const prisma = new PrismaClient();
  const storage: StorageService = new LocalStorageDriver({
    get: (name: string) => process.env[name],
  } as unknown as ConfigService);
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let throttler: ResettableThrottlerStorage;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;
  let a: EntityFixture;
  let b: EntityFixture;
  let c: EntityFixture;
  const cookies: Record<'a' | 'b' | 'c', string> = { a: '', b: '', c: '' };

  // A request from A to B, awaiting B's response.
  const newRequest = async (title = 'Response test request') =>
    (await createTestRequest(prisma, { from: a, to: b, title })).request;

  function respond(
    requestId: string,
    cookie: string,
    {
      position = 'ENDORSED',
      objectionReason,
      file = {
        buffer: ROPA_PDF,
        filename: 'ropa-entry.pdf',
        contentType: 'application/pdf',
      },
      extra = {},
    }: ResponseFields = {},
  ) {
    const req = request(app.getHttpServer())
      .post(`/api/requests/${requestId}/response`)
      .set('Cookie', cookie)
      .field('position', position);
    if (objectionReason !== undefined) {
      req.field('objectionReason', objectionReason);
    }
    for (const [name, value] of Object.entries(extra)) req.field(name, value);
    if (file) {
      req.attach('ropaDocument', file.buffer, {
        filename: file.filename,
        contentType: file.contentType,
      });
    }
    return req;
  }

  // Everything a response writes, to show that nothing was written.
  async function responseState(requestId: string) {
    const [req, ropaDocuments, response] = await Promise.all([
      prisma.dataSharingRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: { status: true },
      }),
      prisma.document.findMany({ where: { requestId, kind: 'ROPA' } }),
      prisma.providerResponse.findUnique({ where: { requestId } }),
    ]);
    return { status: req.status, ropaDocuments, response };
  }

  async function expectUnchanged(requestId: string) {
    expect(await responseState(requestId)).toEqual({
      status: 'AWAITING_PROVIDER_RESPONSE',
      ropaDocuments: [],
      response: null,
    });
  }

  // Stored document files, to show that a failed response leaves none.
  async function storedFiles(): Promise<Set<string>> {
    const dir = join(process.env.UPLOAD_DIR!, 'documents');
    try {
      return new Set(await readdir(dir));
    } catch {
      return new Set();
    }
  }

  beforeAll(async () => {
    ({ app, mail, throttler } = await createTestApp());
    fixtures = await createEntityFixtures(prisma, 3);
    [a, b, c] = fixtures.entities;
    for (const [key, fixture] of [
      ['a', a],
      ['b', b],
      ['c', c],
    ] as const) {
      throttler.reset();
      cookies[key] = await loginAs(app, mail, fixture.dpo.email);
    }
  });

  afterAll(async () => {
    await fixtures?.cleanup();
    await app?.close();
    await prisma.$disconnect();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the RoPA document and position and sets PROVIDER_RESPONDED, in one go', async () => {
    const req = await newRequest();

    const res = await respond(req.id, cookies.b).expect(201);
    expect(res.body).toEqual({ status: 'PROVIDER_RESPONDED' });

    const state = await responseState(req.id);
    expect(state.status).toBe('PROVIDER_RESPONDED');
    expect(state.ropaDocuments).toHaveLength(1);
    const [ropa] = state.ropaDocuments;
    expect(ropa).toMatchObject({
      kind: 'ROPA',
      originalName: 'ropa-entry.pdf',
      mimeType: 'application/pdf',
      sizeBytes: ROPA_PDF.length,
      uploadedById: b.dpo.id,
    });
    expect(ropa.storageKey).toMatch(/^documents\/[0-9a-f-]{36}\.pdf$/);
    const stored = Buffer.concat(
      await (await storage.get(ropa.storageKey)).toArray(),
    );
    expect(Buffer.compare(stored, ROPA_PDF)).toBe(0);
    expect(state.response).toMatchObject({
      ropaDocumentId: ropa.id,
      position: 'ENDORSED',
      objectionReason: null,
      respondedById: b.dpo.id,
    });

    // The provider's detail now carries it; the response is read-only.
    const detail = await request(app.getHttpServer())
      .get(`/api/requests/${req.id}`)
      .set('Cookie', cookies.b)
      .expect(200);
    expect(detail.body.status).toBe('PROVIDER_RESPONDED');
    expect(detail.body.providerResponse).toMatchObject({
      ropaDocument: { id: ropa.id, originalName: 'ropa-entry.pdf' },
      position: 'ENDORSED',
      objectionReason: null,
    });
  });

  it('stores an objection with its reason, trimmed', async () => {
    const req = await newRequest();

    await respond(req.id, cookies.b, {
      position: 'OBJECTED',
      objectionReason: `  ${REASON}\n`,
    }).expect(201);

    const { response } = await responseState(req.id);
    expect(response).toMatchObject({
      position: 'OBJECTED',
      objectionReason: REASON,
    });
  });

  it('ignores a reason sent with an endorsement', async () => {
    const req = await newRequest();

    await respond(req.id, cookies.b, {
      position: 'ENDORSED',
      objectionReason: REASON,
    }).expect(201);

    const { response } = await responseState(req.id);
    expect(response).toMatchObject({
      position: 'ENDORSED',
      objectionReason: null,
    });
  });

  it('accepts a DOCX RoPA entry', async () => {
    const req = await newRequest();

    await respond(req.id, cookies.b, {
      file: {
        buffer: Buffer.from('SYNTHETIC — DEMO DATA'),
        filename: 'ropa-entry.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    }).expect(201);
  });

  describe('returns 400 and stores nothing', () => {
    const cases: [string, ResponseFields, string][] = [
      [
        'an objection without a reason',
        { position: 'OBJECTED' },
        'The reason must be 10 to 1000 characters.',
      ],
      [
        'an objection with a blank reason',
        { position: 'OBJECTED', objectionReason: '          ' },
        'The reason must be 10 to 1000 characters.',
      ],
      [
        'a reason under 10 characters once trimmed',
        { position: 'OBJECTED', objectionReason: '  too short ' },
        'The reason must be 10 to 1000 characters.',
      ],
      [
        'a reason over 1000 characters',
        { position: 'OBJECTED', objectionReason: 'x'.repeat(1001) },
        'The reason must be 10 to 1000 characters.',
      ],
      ['a missing position', { position: '' }, 'Choose a position.'],
      ['an unknown position', { position: 'MAYBE' }, 'Choose a position.'],
      ['a missing RoPA document', { file: null }, 'Choose a RoPA entry file.'],
      [
        'a RoPA document of the wrong type',
        {
          file: {
            buffer: Buffer.from('SYNTHETIC — DEMO DATA'),
            filename: 'ropa.txt',
            contentType: 'text/plain',
          },
        },
        'Only PDF or DOCX files are allowed.',
      ],
    ];

    it.each(cases)('for %s', async (_name, fields, message) => {
      const req = await newRequest();
      const before = await storedFiles();

      const res = await respond(req.id, cookies.b, fields).expect(400);
      expect(res.body).toEqual({ message });

      await expectUnchanged(req.id);
      expect(await storedFiles()).toEqual(before);
    });

    it('for a reason of exactly 1000 characters it succeeds instead', async () => {
      const req = await newRequest();
      await respond(req.id, cookies.b, {
        position: 'OBJECTED',
        objectionReason: 'x'.repeat(1000),
      }).expect(201);
    });

    it('for two RoPA documents', async () => {
      const req = await newRequest();
      const res = await respond(req.id, cookies.b).attach(
        'ropaDocument',
        ROPA_PDF,
        { filename: 'second.pdf', contentType: 'application/pdf' },
      );
      expect(res.status).toBe(400);
      await expectUnchanged(req.id);
    });
  });

  it('returns 409 for a second response and keeps the first', async () => {
    const req = await newRequest();
    await respond(req.id, cookies.b).expect(201);
    const first = await responseState(req.id);
    const before = await storedFiles();

    const res = await respond(req.id, cookies.b, {
      position: 'OBJECTED',
      objectionReason: REASON,
    }).expect(409);
    expect(res.body).toEqual({
      message: 'A response has already been submitted.',
    });

    expect(await responseState(req.id)).toEqual(first);
    expect(await storedFiles()).toEqual(before);
  });

  it('accepts exactly one of two responses submitted at once', async () => {
    const req = await newRequest();
    const before = await storedFiles();

    const results = await Promise.all([
      respond(req.id, cookies.b),
      respond(req.id, cookies.b, {
        position: 'OBJECTED',
        objectionReason: REASON,
      }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const state = await responseState(req.id);
    expect(state.status).toBe('PROVIDER_RESPONDED');
    expect(state.ropaDocuments).toHaveLength(1);
    expect(state.response?.ropaDocumentId).toBe(state.ropaDocuments[0].id);
    // The loser's upload is removed again: exactly one new file remains.
    const after = await storedFiles();
    const added = [...after].filter((name) => !before.has(name));
    expect(added).toEqual([state.ropaDocuments[0].storageKey.slice(10)]);
  });

  it('returns 403 to the requester and stores nothing', async () => {
    const req = await newRequest();
    const before = await storedFiles();

    const res = await respond(req.id, cookies.a).expect(403);
    expect(res.body).toEqual({
      message: 'Only the providing entity can respond to this request.',
    });

    await expectUnchanged(req.id);
    expect(await storedFiles()).toEqual(before);
  });

  it('returns 404 to a non-party and stores nothing', async () => {
    const req = await newRequest();
    const before = await storedFiles();

    const res = await respond(req.id, cookies.c).expect(404);
    expect(res.body).toEqual({ message: 'Request not found.' });

    await expectUnchanged(req.id);
    expect(await storedFiles()).toEqual(before);
  });

  it('requires a session', async () => {
    const req = await newRequest();
    await request(app.getHttpServer())
      .post(`/api/requests/${req.id}/response`)
      .field('position', 'ENDORSED')
      .attach('ropaDocument', ROPA_PDF, {
        filename: 'ropa-entry.pdf',
        contentType: 'application/pdf',
      })
      .expect(401);
    await expectUnchanged(req.id);
  });

  it('refuses inside the transaction when the early status check is passed', async () => {
    const req = await newRequest();
    await respond(req.id, cookies.b).expect(201);
    const first = await responseState(req.id);
    const before = await storedFiles();

    // A racing response read the request before this one committed: the
    // early check sees it still awaiting a response.
    const scope = app.get(RequestScope);
    const findPartyOrThrow = scope.findPartyOrThrow.bind(scope);
    vi.spyOn(scope, 'findPartyOrThrow').mockImplementationOnce((async (
      ...args: Parameters<typeof findPartyOrThrow>
    ) => ({
      ...(await findPartyOrThrow(...args)),
      status: 'AWAITING_PROVIDER_RESPONSE',
    })) as never);

    await respond(req.id, cookies.b, {
      position: 'OBJECTED',
      objectionReason: REASON,
    }).expect(409);

    expect(await responseState(req.id)).toEqual(first);
    expect(await storedFiles()).toEqual(before);
  });

  it('rolls everything back, and removes the stored file, if the transaction fails', async () => {
    const req = await newRequest();
    const before = await storedFiles();

    // Fail the last write inside the transaction, after the status change
    // and the RoPA Document have been written.
    const prismaService = app.get(PrismaService);
    const transaction = prismaService.$transaction.bind(prismaService);
    vi.spyOn(prismaService, '$transaction').mockImplementationOnce(((
      fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) =>
      transaction((tx) =>
        fn(
          new Proxy(tx, {
            get: (target, key) =>
              key === 'providerResponse'
                ? {
                    create: () =>
                      Promise.reject(new Error('Simulated failure.')),
                  }
                : target[key as keyof typeof target],
          }),
        ),
      )) as never);

    await respond(req.id, cookies.b).expect(500);

    await expectUnchanged(req.id);
    expect(await storedFiles()).toEqual(before);
  });

  describe('after a real response', () => {
    let requestId: string;
    let ropaId: string;

    beforeAll(async () => {
      const req = await newRequest('Responded request');
      requestId = req.id;
      await respond(requestId, cookies.b, {
        position: 'OBJECTED',
        objectionReason: REASON,
      }).expect(201);
      ropaId = (await responseState(requestId)).ropaDocuments[0].id;
    });

    it("leaves providerResponse out of the requester's detail", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/requests/${requestId}`)
        .set('Cookie', cookies.a)
        .expect(200);
      expect(res.body.status).toBe('PROVIDER_RESPONDED');
      expect(res.body).not.toHaveProperty('providerResponse');
      expect(res.text).not.toContain(ropaId);
      expect(res.text).not.toContain(REASON);
    });

    it('returns 404 to the requester downloading the RoPA document', async () => {
      await request(app.getHttpServer())
        .get(`/api/requests/${requestId}/documents/${ropaId}`)
        .set('Cookie', cookies.a)
        .expect(404);
    });

    it('lets the provider download the RoPA document', async () => {
      await request(app.getHttpServer())
        .get(`/api/requests/${requestId}/documents/${ropaId}`)
        .set('Cookie', cookies.b)
        .expect(200)
        .expect('Content-Type', 'application/pdf');
    });
  });
});
