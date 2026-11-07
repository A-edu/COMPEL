import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { FLAG_SOURCE_PROVIDER_OBJECTION } from '../src/requests/flag-reasons.js';
import { buildPlaceholderPdf } from '../src/seed/placeholder-pdf.js';
import {
  createTestApp,
  loginAs,
  type MockMailTransport,
  type ResettableThrottlerStorage,
} from './auth-helpers.js';
import {
  createEntityFixtures,
  createOfficer,
  createTestRequest,
  type EntityFixture,
} from './fixtures.js';

const ROPA_PDF = buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', 'RoPA entry']);
const REASON = 'The legal basis for sharing is not stated.';
const BACKFILL_SQL = join(
  dirname(fileURLToPath(import.meta.url)),
  '../prisma/migrations/20261107020100_backfill_objection_flags/migration.sql',
);

// What differs between any two requests, whatever happened to them.
const IDENTITY = ['id', 'reference', 'title', 'createdAt'];
function withoutIdentity(body: Record<string, unknown>) {
  const rest = Object.entries(body).filter(([k]) => !IDENTITY.includes(k));
  return JSON.parse(
    JSON.stringify(Object.fromEntries(rest), (key, value: unknown) =>
      ['id', 'createdAt'].includes(key) ? undefined : value,
    ),
  ) as Record<string, unknown>;
}

describe('Flagging (e2e)', () => {
  const prisma = new PrismaClient();
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let throttler: ResettableThrottlerStorage;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;
  let a: EntityFixture;
  let b: EntityFixture;
  let c: EntityFixture;
  const cookies: Record<'a' | 'b' | 'c' | 'officer', string> = {
    a: '',
    b: '',
    c: '',
    officer: '',
  };

  const get = (path: string, cookie: string) =>
    request(app.getHttpServer()).get(`/api${path}`).set('Cookie', cookie);

  const newRequest = async (title: string) =>
    (await createTestRequest(prisma, { from: a, to: b, title })).request;

  function respond(id: string, position: string, objectionReason?: string) {
    const req = request(app.getHttpServer())
      .post(`/api/requests/${id}/response`)
      .set('Cookie', cookies.b)
      .field('position', position);
    if (objectionReason) req.field('objectionReason', objectionReason);
    return req.attach('ropaDocument', ROPA_PDF, {
      filename: 'ropa-entry.pdf',
      contentType: 'application/pdf',
    });
  }

  const decide = (id: string, outcome: 'APPROVED' | 'REJECTED') =>
    request(app.getHttpServer())
      .post(`/api/review/requests/${id}/decision`)
      .set('Cookie', cookies.officer)
      .send({ outcome, justification: 'Reviewed against the PDPL.' })
      .expect(201);

  const reasons = (requestId: string) =>
    prisma.flagReason.findMany({ where: { requestId } });

  async function rowFor(direction: string, cookie: string, id: string) {
    const res = await get(`/requests?direction=${direction}`, cookie).expect(
      200,
    );
    const row = (res.body as { id: string }[]).find((r) => r.id === id);
    expect(row).toBeDefined();
    return row as unknown as Record<string, unknown>;
  }

  // A provider response as Sprint 1 stored it: no flag reason beside it.
  async function sprint1Response(
    title: string,
    position: 'ENDORSED' | 'OBJECTED',
  ) {
    const { id } = await newRequest(title);
    const ropa = await prisma.document.create({
      data: {
        requestId: id,
        kind: 'ROPA',
        storageKey: `seed/e2e-${id}/ropa.pdf`,
        originalName: 'ropa.pdf',
        mimeType: 'application/pdf',
        sizeBytes: ROPA_PDF.length,
        uploadedById: b.dpo.id,
      },
    });
    const response = await prisma.providerResponse.create({
      data: {
        requestId: id,
        ropaDocumentId: ropa.id,
        position,
        objectionReason: position === 'OBJECTED' ? REASON : null,
        respondedById: b.dpo.id,
      },
    });
    await prisma.dataSharingRequest.update({
      where: { id },
      data: { status: 'PROVIDER_RESPONDED' },
    });
    return { id, response };
  }

  beforeAll(async () => {
    ({ app, mail, throttler } = await createTestApp());
    fixtures = await createEntityFixtures(prisma, 4);
    const [sdaia] = fixtures.entities.slice(3);
    [a, b, c] = fixtures.entities;
    for (const [key, fixture] of [
      ['a', a],
      ['b', b],
      ['c', c],
    ] as const) {
      throttler.reset();
      cookies[key] = await loginAs(app, mail, fixture.dpo.email);
    }
    const officer = await createOfficer(prisma, sdaia);
    throttler.reset();
    cookies.officer = await loginAs(app, mail, officer.email);
  });

  afterAll(async () => {
    await fixtures?.cleanup();
    await app?.close();
    await prisma.$disconnect();
  });

  describe('when the provider responds', () => {
    it('flags an objection, with the objection as the reason', async () => {
      const { id } = await newRequest('Objected');
      await respond(id, 'OBJECTED', REASON).expect(201);

      expect(await reasons(id)).toEqual([
        expect.objectContaining({
          source: FLAG_SOURCE_PROVIDER_OBJECTION,
          text: REASON,
          createdAt: expect.any(Date) as Date,
        }),
      ]);
    });

    it('does not flag an endorsement', async () => {
      const { id } = await newRequest('Endorsed');
      await respond(id, 'ENDORSED').expect(201);
      expect(await reasons(id)).toEqual([]);
    });

    it('ignores a reason sent with an endorsement', async () => {
      const { id } = await newRequest('Endorsed with a stray reason');
      await respond(id, 'ENDORSED', REASON).expect(201);
      expect(await reasons(id)).toEqual([]);
    });

    it('adds no second reason when a second response is refused', async () => {
      const { id } = await newRequest('Objected twice');
      await respond(id, 'OBJECTED', REASON).expect(201);
      await respond(id, 'OBJECTED', REASON).expect(409);
      expect(await reasons(id)).toHaveLength(1);
    });
  });

  describe('what the requester can see', () => {
    let objected: string;
    let endorsed: string;

    beforeAll(async () => {
      objected = (await newRequest('Requester view: objected')).id;
      endorsed = (await newRequest('Requester view: endorsed')).id;
      await respond(objected, 'OBJECTED', REASON).expect(201);
      await respond(endorsed, 'ENDORSED').expect(201);
    });

    it('cannot tell an objection from an endorsement on the detail', async () => {
      const flagged = await get(`/requests/${objected}`, cookies.a).expect(200);
      const plain = await get(`/requests/${endorsed}`, cookies.a).expect(200);

      expect(flagged.body).not.toHaveProperty('flagged');
      expect(flagged.text).not.toContain(REASON);
      expect(withoutIdentity(flagged.body as Record<string, unknown>)).toEqual(
        withoutIdentity(plain.body as Record<string, unknown>),
      );
    });

    it('cannot tell them apart in the sent list', async () => {
      const flagged = await rowFor('sent', cookies.a, objected);
      const plain = await rowFor('sent', cookies.a, endorsed);

      expect(flagged).not.toHaveProperty('flagged');
      expect(flagged).not.toHaveProperty('flagReasons');
      expect(withoutIdentity(flagged)).toEqual(withoutIdentity(plain));
    });

    it('sees the outcome once decided, but still not the position', async () => {
      const { id } = await newRequest('Requester view: decided');
      await respond(id, 'OBJECTED', REASON).expect(201);
      await decide(id, 'REJECTED');

      const res = await get(`/requests/${id}`, cookies.a).expect(200);
      expect(res.body).toMatchObject({ status: 'REJECTED' });
      expect(res.body).not.toHaveProperty('providerResponse');
      expect(res.text).not.toContain(REASON);
    });
  });

  describe('what the provider can see', () => {
    it('sees its objection under review, on the detail and the list', async () => {
      const { id } = await newRequest('Provider view: objected');
      await respond(id, 'OBJECTED', REASON).expect(201);

      const detail = await get(`/requests/${id}`, cookies.b).expect(200);
      expect(detail.body).toMatchObject({ flagged: true });
      expect(await rowFor('received', cookies.b, id)).toMatchObject({
        flagged: true,
      });
    });

    it('sees no flag on an endorsement', async () => {
      const { id } = await newRequest('Provider view: endorsed');
      await respond(id, 'ENDORSED').expect(201);

      const detail = await get(`/requests/${id}`, cookies.b).expect(200);
      expect(detail.body).not.toHaveProperty('flagged');
      expect(await rowFor('received', cookies.b, id)).not.toHaveProperty(
        'flagged',
      );
    });

    it('sees the outcome instead of the flag once decided', async () => {
      const { id } = await newRequest('Provider view: decided');
      await respond(id, 'OBJECTED', REASON).expect(201);
      await decide(id, 'APPROVED');

      const detail = await get(`/requests/${id}`, cookies.b).expect(200);
      expect(detail.body).toMatchObject({ status: 'APPROVED' });
      expect(detail.body).not.toHaveProperty('flagged');
    });
  });

  it('treats a reason from any source the same way', async () => {
    const { id } = await newRequest('Made-up source');
    await respond(id, 'ENDORSED').expect(201);
    await prisma.flagReason.create({
      data: { requestId: id, source: 'MADE_UP_CHECK', text: 'A later check.' },
    });

    const provider = await get(`/requests/${id}`, cookies.b).expect(200);
    expect(provider.body).toMatchObject({ flagged: true });

    const requester = await get(`/requests/${id}`, cookies.a).expect(200);
    expect(requester.body).toMatchObject({ status: 'PROVIDER_RESPONDED' });
    expect(requester.body).not.toHaveProperty('flagged');
  });

  it('shows another entity nothing about a flagged request', async () => {
    const { id } = await newRequest('Isolation: flagged');
    await respond(id, 'OBJECTED', REASON).expect(201);

    await get(`/requests/${id}`, cookies.c).expect(404);
    for (const direction of ['sent', 'received']) {
      const res = await get(
        `/requests?direction=${direction}`,
        cookies.c,
      ).expect(200);
      expect(res.text).not.toContain(id);
    }
  });

  describe('the backfill of past objections', () => {
    const backfill = async () =>
      prisma.$executeRawUnsafe(await readFile(BACKFILL_SQL, 'utf-8'));

    it('flags a past objection with its reason and original time', async () => {
      const { id, response } = await sprint1Response('Past objection', 'OBJECTED');
      await backfill();

      expect(await reasons(id)).toEqual([
        expect.objectContaining({
          source: FLAG_SOURCE_PROVIDER_OBJECTION,
          text: REASON,
          createdAt: response.createdAt,
        }),
      ]);
    });

    it('leaves a past endorsement unflagged', async () => {
      const { id } = await sprint1Response('Past endorsement', 'ENDORSED');
      await backfill();
      expect(await reasons(id)).toEqual([]);
    });

    it('changes no status, so the requester sees what it saw before', async () => {
      const { id } = await sprint1Response('Past objection: status', 'OBJECTED');
      const before = await get(`/requests/${id}`, cookies.a).expect(200);
      await backfill();
      const after = await get(`/requests/${id}`, cookies.a).expect(200);

      expect(after.body).toEqual(before.body);
    });

    it('adds nothing when run again', async () => {
      const { id } = await sprint1Response('Past objection: twice', 'OBJECTED');
      await backfill();
      await backfill();
      expect(await reasons(id)).toHaveLength(1);
    });

    it('skips an objection already flagged when it was made', async () => {
      const { id } = await newRequest('Live objection');
      await respond(id, 'OBJECTED', REASON).expect(201);
      await backfill();
      expect(await reasons(id)).toHaveLength(1);
    });
  });
});
