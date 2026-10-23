import type { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { RequestScope } from '../src/requests/request-scope.js';
import { LocalStorageDriver } from '../src/storage/local-storage.driver.js';
import type { StorageService } from '../src/storage/storage.interface.js';
import {
  createTestApp,
  loginAs,
  type MockMailTransport,
  type ResettableThrottlerStorage,
} from './auth-helpers.js';
import { createEntityFixtures, createTestRequest } from './fixtures.js';

describe('Shared e2e helpers and request scope (e2e)', () => {
  const prisma = new PrismaClient();
  const storage: StorageService = new LocalStorageDriver({
    get: (name: string) => process.env[name],
  } as unknown as ConfigService);
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let throttler: ResettableThrottlerStorage;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;

  beforeAll(async () => {
    ({ app, mail, throttler } = await createTestApp());
    fixtures = await createEntityFixtures(prisma, 3);
  });

  afterAll(async () => {
    await fixtures?.cleanup();
    await app?.close();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    throttler.reset();
  });

  it('creates distinct entities, each with one active DPO', () => {
    const [a, b, c] = fixtures.entities;
    expect(new Set([a, b, c].map((f) => f.entity.id)).size).toBe(3);
    for (const { entity, dpo } of fixtures.entities) {
      expect(dpo.entityId).toBe(entity.id);
      expect(dpo.isActive).toBe(true);
      expect(dpo.email).toMatch(/\.example$/);
    }
  });

  it('loginAs returns a cookie that authenticates as that DPO', async () => {
    const [a] = fixtures.entities;
    const cookie = await loginAs(app, mail, a.dpo.email);
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(me.body.entity.id).toBe(a.entity.id);
  });

  it('createTestRequest stores a request with its request form and file', async () => {
    const [a, b] = fixtures.entities;
    const { request: req, requestForm } = await createTestRequest(prisma, {
      from: a,
      to: b,
    });

    expect(req.reference).toMatch(/^CMP-\d{4}-\d{6}$/);
    expect(req.status).toBe('AWAITING_PROVIDER_RESPONSE');
    expect(req.submittedById).toBe(a.dpo.id);
    expect(requestForm).toMatchObject({
      requestId: req.id,
      kind: 'REQUEST_FORM',
      mimeType: 'application/pdf',
    });
    await expect(storage.exists(requestForm.storageKey)).resolves.toBe(true);
  });

  it('RequestScope finds a request only for its two parties', async () => {
    const [a, b, c] = fixtures.entities;
    const { request: req } = await createTestRequest(prisma, {
      from: a,
      to: b,
    });
    const scope = app.get(RequestScope);
    const as = (f: typeof a) => ({ userId: f.dpo.id, entityId: f.entity.id });

    await expect(scope.findPartyOrThrow(as(a), req.id)).resolves.toMatchObject({
      id: req.id,
    });
    await expect(scope.findPartyOrThrow(as(b), req.id)).resolves.toMatchObject({
      id: req.id,
    });
    await expect(scope.findPartyOrThrow(as(c), req.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const ids = async (f: typeof a) =>
      (await scope.findMany(as(f), { select: { id: true } })).map((r) => r.id);
    expect(await ids(a)).toContain(req.id);
    expect(await ids(b)).toContain(req.id);
    expect(await ids(c)).not.toContain(req.id);
  });

  it('cleanup removes everything created between the fixtures, files included', async () => {
    const own = await createEntityFixtures(prisma, 2);
    const [a, b] = own.entities;
    await loginAs(app, mail, a.dpo.email);
    const { request: req, requestForm } = await createTestRequest(prisma, {
      from: a,
      to: b,
    });
    // A provider response with its RoPA document, as §10 will create.
    const ropa = await prisma.document.create({
      data: {
        requestId: req.id,
        kind: 'ROPA',
        storageKey: requestForm.storageKey.replace('.pdf', '-ropa.pdf'),
        originalName: 'ropa.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        uploadedById: b.dpo.id,
      },
    });
    await storage.put(ropa.storageKey, Buffer.from('x'), 'application/pdf');
    await prisma.providerResponse.create({
      data: {
        requestId: req.id,
        ropaDocumentId: ropa.id,
        position: 'ENDORSED',
        respondedById: b.dpo.id,
      },
    });

    await own.cleanup();

    const entityIds = [a.entity.id, b.entity.id];
    const userIds = [a.dpo.id, b.dpo.id];
    await expect(
      prisma.entity.count({ where: { id: { in: entityIds } } }),
    ).resolves.toBe(0);
    await expect(
      prisma.user.count({ where: { id: { in: userIds } } }),
    ).resolves.toBe(0);
    await expect(
      prisma.dataSharingRequest.count({ where: { id: req.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.document.count({ where: { requestId: req.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.providerResponse.count({ where: { requestId: req.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.session.count({ where: { userId: { in: userIds } } }),
    ).resolves.toBe(0);
    await expect(
      prisma.authEvent.count({ where: { userId: { in: userIds } } }),
    ).resolves.toBe(0);
    await expect(storage.exists(requestForm.storageKey)).resolves.toBe(false);
    await expect(storage.exists(ropa.storageKey)).resolves.toBe(false);

    // Safe to call again.
    await expect(own.cleanup()).resolves.toBeUndefined();
  });
});
