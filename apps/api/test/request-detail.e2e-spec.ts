import type { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
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

// Collects a download's bytes whatever its content type.
function binary(
  res: request.Response,
  callback: (error: Error | null, body: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Request detail and downloads (e2e)', () => {
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

  const get = (path: string, cookie: string) =>
    request(app.getHttpServer()).get(`/api${path}`).set('Cookie', cookie);

  // Writes a document and its file straight to the test database and
  // UPLOAD_DIR; the fixtures' cleanup() removes both.
  async function addDocument(
    requestId: string,
    uploader: EntityFixture,
    kind: 'SUPPORTING' | 'ROPA',
    originalName: string,
  ) {
    const pdf = buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', originalName]);
    const storageKey = `documents/${randomUUID()}.pdf`;
    await storage.put(storageKey, pdf, 'application/pdf');
    const document = await prisma.document.create({
      data: {
        requestId,
        kind,
        storageKey,
        originalName,
        mimeType: 'application/pdf',
        sizeBytes: pdf.length,
        uploadedById: uploader.dpo.id,
      },
    });
    return { document, pdf };
  }

  // A provider response written directly, as PR 2's endpoint would.
  async function respond(
    requestId: string,
    provider: EntityFixture,
    position: 'ENDORSED' | 'OBJECTED',
    objectionReason: string | null = null,
  ) {
    const ropa = await addDocument(
      requestId,
      provider,
      'ROPA',
      `ropa-${randomUUID()}.pdf`,
    );
    const response = await prisma.providerResponse.create({
      data: {
        requestId,
        ropaDocumentId: ropa.document.id,
        position,
        objectionReason,
        respondedById: provider.dpo.id,
      },
    });
    await prisma.dataSharingRequest.update({
      where: { id: requestId },
      data: { status: 'PROVIDER_RESPONDED' },
    });
    return { ...ropa, response };
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

  describe('before the provider responds', () => {
    let req: Awaited<ReturnType<typeof createTestRequest>>['request'];
    let requestForm: Awaited<
      ReturnType<typeof createTestRequest>
    >['requestForm'];
    let supporting: Awaited<ReturnType<typeof addDocument>>;

    beforeAll(async () => {
      ({ request: req, requestForm } = await createTestRequest(prisma, {
        from: a,
        to: b,
        title: 'Detail before response',
      }));
      supporting = await addDocument(
        req.id,
        a,
        'SUPPORTING',
        'سجل البيانات.pdf',
      );
    });

    it('gives the requester the detail without a providerResponse key', async () => {
      const res = await get(`/requests/${req.id}`, cookies.a).expect(200);

      expect(res.body).toEqual({
        id: req.id,
        reference: req.reference,
        title: 'Detail before response',
        status: 'AWAITING_PROVIDER_RESPONSE',
        createdAt: req.createdAt.toISOString(),
        requestingEntity: { id: a.entity.id, name: a.entity.name },
        providingEntity: { id: b.entity.id, name: b.entity.name },
        myRole: 'REQUESTER',
        documents: [
          {
            id: requestForm.id,
            kind: 'REQUEST_FORM',
            originalName: 'request-form.pdf',
            sizeBytes: requestForm.sizeBytes,
            createdAt: requestForm.createdAt.toISOString(),
          },
          {
            id: supporting.document.id,
            kind: 'SUPPORTING',
            originalName: 'سجل البيانات.pdf',
            sizeBytes: supporting.pdf.length,
            createdAt: supporting.document.createdAt.toISOString(),
          },
        ],
      });
      expect(res.body).not.toHaveProperty('providerResponse');
    });

    it('gives the provider the detail with providerResponse null', async () => {
      const res = await get(`/requests/${req.id}`, cookies.b).expect(200);

      expect(res.body.myRole).toBe('PROVIDER');
      expect(res.body).toHaveProperty('providerResponse', null);
      expect(res.body.documents.map((d: { id: string }) => d.id)).toEqual([
        requestForm.id,
        supporting.document.id,
      ]);
    });

    it('returns 404 to a non-party and for an unknown request', async () => {
      const notParty = await get(`/requests/${req.id}`, cookies.c).expect(404);
      expect(notParty.body).toEqual({ message: 'Request not found.' });

      const unknown = await get(`/requests/${randomUUID()}`, cookies.c).expect(
        404,
      );
      // The same answer, so a non-party cannot tell the request exists.
      expect(unknown.body).toEqual(notParty.body);
    });

    it('requires a session', async () => {
      await request(app.getHttpServer())
        .get(`/api/requests/${req.id}`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/api/requests/${req.id}/documents/${requestForm.id}`)
        .expect(401);
    });

    it('downloads the request form and supporting documents for both parties', async () => {
      const formBytes = await storage.get(requestForm.storageKey);
      const formPdf = Buffer.concat(await formBytes.toArray());

      for (const cookie of [cookies.a, cookies.b]) {
        const form = await get(
          `/requests/${req.id}/documents/${requestForm.id}`,
          cookie,
        )
          .buffer(true)
          .parse(binary)
          .expect(200);
        expect(form.headers['content-type']).toBe('application/pdf');
        expect(form.headers['content-disposition']).toMatch(
          /^attachment; filename="?request-form\.pdf"?$/,
        );
        expect(form.headers['x-content-type-options']).toBe('nosniff');
        expect(Buffer.compare(form.body as Buffer, formPdf)).toBe(0);

        const extra = await get(
          `/requests/${req.id}/documents/${supporting.document.id}`,
          cookie,
        )
          .buffer(true)
          .parse(binary)
          .expect(200);
        // Non-ASCII names keep the original in filename* (RFC 5987).
        expect(extra.headers['content-disposition']).toMatch(/^attachment;/);
        expect(extra.headers['content-disposition']).toContain(
          `filename*=UTF-8''${encodeURIComponent('سجل البيانات.pdf')}`,
        );
        expect(Buffer.compare(extra.body as Buffer, supporting.pdf)).toBe(0);
      }
    });

    it('returns 404 for a non-party download', async () => {
      for (const documentId of [requestForm.id, supporting.document.id]) {
        const res = await get(
          `/requests/${req.id}/documents/${documentId}`,
          cookies.c,
        ).expect(404);
        expect(res.body).toEqual({ message: 'Request not found.' });
      }
    });

    it('returns 404 for a document of another request', async () => {
      const other = await createTestRequest(prisma, {
        from: a,
        to: c,
        title: 'Another request',
      });
      // b is a party to req but not to `other`.
      await get(
        `/requests/${req.id}/documents/${other.requestForm.id}`,
        cookies.b,
      ).expect(404);
      await get(
        `/requests/${req.id}/documents/${randomUUID()}`,
        cookies.a,
      ).expect(404);
    });
  });

  describe('after the provider responds', () => {
    let req: Awaited<ReturnType<typeof createTestRequest>>['request'];
    let requestForm: Awaited<
      ReturnType<typeof createTestRequest>
    >['requestForm'];
    let ropa: Awaited<ReturnType<typeof respond>>;
    const reason = 'The legal basis for sharing is not stated.';

    beforeAll(async () => {
      ({ request: req, requestForm } = await createTestRequest(prisma, {
        from: a,
        to: b,
        title: 'Detail after response',
      }));
      ropa = await respond(req.id, b, 'OBJECTED', reason);
    });

    it('gives the provider the response, and lists no RoPA among the documents', async () => {
      const res = await get(`/requests/${req.id}`, cookies.b).expect(200);

      expect(res.body.status).toBe('PROVIDER_RESPONDED');
      expect(res.body.documents).toEqual([
        expect.objectContaining({ id: requestForm.id, kind: 'REQUEST_FORM' }),
      ]);
      expect(res.body.providerResponse).toEqual({
        ropaDocument: {
          id: ropa.document.id,
          originalName: ropa.document.originalName,
          sizeBytes: ropa.pdf.length,
          createdAt: ropa.document.createdAt.toISOString(),
        },
        position: 'OBJECTED',
        objectionReason: reason,
        createdAt: ropa.response.createdAt.toISOString(),
      });
    });

    it('gives the requester the new status and nothing of the response', async () => {
      const res = await get(`/requests/${req.id}`, cookies.a).expect(200);

      expect(res.body.status).toBe('PROVIDER_RESPONDED');
      expect(res.body).not.toHaveProperty('providerResponse');
      expect(res.body.documents).toEqual([
        expect.objectContaining({ id: requestForm.id }),
      ]);
      expect(res.text).not.toContain(ropa.document.id);
      expect(res.text).not.toContain(ropa.document.originalName);
      expect(res.text).not.toContain(reason);
    });

    it('returns 404 to the requester downloading the RoPA document', async () => {
      const res = await get(
        `/requests/${req.id}/documents/${ropa.document.id}`,
        cookies.a,
      ).expect(404);
      expect(res.body).toEqual({ message: 'Document not found.' });
    });

    it('returns 404 to a non-party downloading the RoPA document', async () => {
      await get(
        `/requests/${req.id}/documents/${ropa.document.id}`,
        cookies.c,
      ).expect(404);
    });

    it('lets the provider download the RoPA document', async () => {
      const res = await get(
        `/requests/${req.id}/documents/${ropa.document.id}`,
        cookies.b,
      )
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect(res.headers['content-disposition']).toMatch(/^attachment;/);
      expect(res.headers['content-disposition']).toContain(
        ropa.document.originalName,
      );
      expect(Buffer.compare(res.body as Buffer, ropa.pdf)).toBe(0);
    });
  });
});
