import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ALLOWED_TYPES } from '../src/documents/upload-check.js';
import { REFERENCE_PATTERN } from '../src/requests/reference.js';
import {
  createTestApp,
  loginAs,
  type MockMailTransport,
  type ResettableThrottlerStorage,
} from './auth-helpers.js';
import { createEntityFixtures, type EntityFixture } from './fixtures.js';

const pdf = Buffer.from('%PDF-1.4 SYNTHETIC — DEMO DATA');
const NOT_FOUND = { message: 'Request not found.' };
const TITLE = 'Isolation: employer contribution records';
const REASON = 'The legal basis for sharing is not stated.';

type Party = 'a' | 'b' | 'c';

// §11 (US-20) with three entities A, B and C and one request from A to B,
// submitted through the real POST /requests. C is a party to nothing.
describe('Entity isolation (e2e)', () => {
  const prisma = new PrismaClient();
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let throttler: ResettableThrottlerStorage;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;
  let a: EntityFixture;
  let b: EntityFixture;
  let c: EntityFixture;
  const cookies: Record<Party, string> = { a: '', b: '', c: '' };

  // The request from A to B, and its request form and supporting document.
  let requestId: string;
  let documentIds: string[];

  const http = () => request(app.getHttpServer());
  const get = (party: Party, path: string) =>
    http().get(`/api${path}`).set('Cookie', cookies[party]);

  function submit(party: Party, fields: Record<string, string>) {
    let req = http().post('/api/requests').set('Cookie', cookies[party]);
    for (const [name, value] of Object.entries(fields)) {
      req = req.field(name, value);
    }
    return req.attach('requestForm', pdf, {
      filename: 'request-form.pdf',
      contentType: ALLOWED_TYPES.pdf,
    });
  }

  function respond(
    party: Party,
    id: string,
    fields: Record<string, string> = {},
  ) {
    let req = http()
      .post(`/api/requests/${id}/response`)
      .set('Cookie', cookies[party])
      .field('position', 'OBJECTED')
      .field('objectionReason', REASON);
    for (const [name, value] of Object.entries(fields)) {
      req = req.field(name, value);
    }
    return req.attach('ropaDocument', pdf, {
      filename: 'ropa-entry.pdf',
      contentType: ALLOWED_TYPES.pdf,
    });
  }

  async function listIds(
    party: Party,
    direction: 'sent' | 'received',
    extraQuery = '',
  ): Promise<string[]> {
    const res = await get(
      party,
      `/requests?direction=${direction}${extraQuery}`,
    ).expect(200);
    return (res.body as { id: string }[]).map((r) => r.id);
  }

  // Everything about the A→B request a response or a forged body could
  // change, and every request between the three entities.
  async function snapshot() {
    const entityIds = [a, b, c].map((f) => f.entity.id);
    const [target, all] = await Promise.all([
      prisma.dataSharingRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: {
          documents: { orderBy: { id: 'asc' } },
          providerResponse: true,
        },
      }),
      prisma.dataSharingRequest.findMany({
        where: {
          OR: [
            { requestingEntityId: { in: entityIds } },
            { providingEntityId: { in: entityIds } },
          ],
        },
        select: { id: true, requestingEntityId: true, providingEntityId: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    return { target, all };
  }

  beforeAll(async () => {
    ({ app, mail, throttler } = await createTestApp());
    fixtures = await createEntityFixtures(prisma, 3);
    [a, b, c] = fixtures.entities;
    for (const [party, fixture] of [
      ['a', a],
      ['b', b],
      ['c', c],
    ] as const) {
      throttler.reset();
      cookies[party] = await loginAs(app, mail, fixture.dpo.email);
    }

    const res = await submit('a', {
      providingEntityId: b.entity.id,
      title: TITLE,
    })
      .attach('supportingDocuments', pdf, {
        filename: 'supporting.pdf',
        contentType: ALLOWED_TYPES.pdf,
      })
      .expect(201);
    requestId = res.body.id;

    const detail = await get('a', `/requests/${requestId}`).expect(200);
    documentIds = (detail.body.documents as { id: string }[]).map((d) => d.id);
    expect(documentIds).toHaveLength(2);
  });

  afterAll(async () => {
    await fixtures?.cleanup();
    await app?.close();
    await prisma.$disconnect();
  });

  it('records the request from A to B', async () => {
    const { target } = await snapshot();
    expect(target).toMatchObject({
      requestingEntityId: a.entity.id,
      providingEntityId: b.entity.id,
      submittedById: a.dpo.id,
      status: 'AWAITING_PROVIDER_RESPONSE',
    });
  });

  describe('C, a party to nothing', () => {
    it("gets 404 on the request's detail, the same as for no request at all", async () => {
      const res = await get('c', `/requests/${requestId}`).expect(404);
      expect(res.body).toEqual(NOT_FOUND);
      const missing = await get('c', `/requests/${randomUUID()}`).expect(404);
      expect(missing.body).toEqual(res.body);
    });

    it("gets 404 on each of the request's documents", async () => {
      for (const documentId of documentIds) {
        const res = await get(
          'c',
          `/requests/${requestId}/documents/${documentId}`,
        ).expect(404);
        expect(res.body).toEqual(NOT_FOUND);
      }
    });

    it("gets 404 on the request's response endpoint, and nothing changes", async () => {
      const before = await snapshot();
      const res = await respond('c', requestId).expect(404);
      expect(res.body).toEqual(NOT_FOUND);
      expect(await snapshot()).toEqual(before);
    });

    it('does not see the request in its sent or received list', async () => {
      expect(await listIds('c', 'sent')).not.toContain(requestId);
      expect(await listIds('c', 'received')).not.toContain(requestId);
    });
  });

  describe('lists', () => {
    it("include the request in A's sent list and B's received list", async () => {
      expect(await listIds('a', 'sent')).toContain(requestId);
      expect(await listIds('b', 'received')).toContain(requestId);
    });

    it("leave it out of A's received list and B's sent list", async () => {
      expect(await listIds('a', 'received')).not.toContain(requestId);
      expect(await listIds('b', 'sent')).not.toContain(requestId);
    });
  });

  describe('GET /entities', () => {
    it("never includes the caller's own entity", async () => {
      for (const [party, own] of [
        ['a', a],
        ['b', b],
        ['c', c],
      ] as const) {
        const res = await get(party, '/entities').expect(200);
        const ids = (res.body as { id: string }[]).map((e) => e.id);
        expect(ids).not.toContain(own.entity.id);
        // The other two are still offered.
        for (const other of [a, b, c].filter((f) => f !== own)) {
          expect(ids).toContain(other.entity.id);
        }
      }
    });

    it('ignores an entity ID in the query string', async () => {
      const res = await get(
        'c',
        `/entities?entityId=${a.entity.id}&excludeEntityId=${a.entity.id}`,
      ).expect(200);
      const ids = (res.body as { id: string }[]).map((e) => e.id);
      expect(ids).not.toContain(c.entity.id);
    });
  });

  // §11: changing providingEntityId or any entity ID in a request body (or
  // query string) cannot grant access to another entity's requests.
  describe('entity IDs sent by the client', () => {
    it('cannot make C the requester of a request on behalf of A', async () => {
      const before = await snapshot();
      const res = await submit('c', {
        providingEntityId: b.entity.id,
        title: 'Isolation: forged requester',
        requestingEntityId: a.entity.id,
        submittedById: a.dpo.id,
        entityId: a.entity.id,
        status: 'PROVIDER_RESPONDED',
        reference: 'CMP-2000-000001',
      }).expect(201);

      // Created as C's own request, from the session; the forged fields are
      // ignored.
      const created = await prisma.dataSharingRequest.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(created).toMatchObject({
        requestingEntityId: c.entity.id,
        providingEntityId: b.entity.id,
        submittedById: c.dpo.id,
        status: 'AWAITING_PROVIDER_RESPONSE',
      });
      expect(created.reference).toMatch(REFERENCE_PATTERN);
      expect(created.reference).not.toBe('CMP-2000-000001');

      // A sees nothing of it, and the A→B request is untouched.
      expect(await listIds('a', 'sent')).not.toContain(created.id);
      await get('a', `/requests/${created.id}`).expect(404);
      const after = await snapshot();
      expect(after.target).toEqual(before.target);
      expect(after.all.filter((r) => r.id !== created.id)).toEqual(before.all);
    });

    it('cannot name C itself as the provider', async () => {
      const before = await snapshot();
      await submit('c', {
        providingEntityId: c.entity.id,
        title: 'Isolation: own entity as provider',
      }).expect(400);
      expect(await snapshot()).toEqual(before);
    });

    it('cannot get C past 404 on the response endpoint', async () => {
      const before = await snapshot();
      const forgeries: Record<string, string>[] = [
        { providingEntityId: c.entity.id },
        { requestingEntityId: c.entity.id },
        { entityId: c.entity.id },
        { entityId: b.entity.id },
        { providingEntityId: b.entity.id, respondedById: b.dpo.id },
        { requestId },
      ];
      for (const fields of forgeries) {
        const res = await respond('c', requestId, fields).expect(404);
        expect(res.body).toEqual(NOT_FOUND);
      }
      expect(await snapshot()).toEqual(before);
    });

    it('cannot make the requester A the provider', async () => {
      const before = await snapshot();
      const forgeries: Record<string, string>[] = [
        { providingEntityId: a.entity.id },
        { entityId: b.entity.id },
      ];
      for (const fields of forgeries) {
        await respond('a', requestId, fields).expect(403);
      }
      expect(await snapshot()).toEqual(before);
    });

    it("cannot widen C's lists", async () => {
      for (const query of [
        `&entityId=${a.entity.id}`,
        `&entityId=${b.entity.id}`,
        `&requestingEntityId=${a.entity.id}`,
        `&providingEntityId=${b.entity.id}`,
        `&requestingEntityId=${a.entity.id}&providingEntityId=${b.entity.id}`,
      ]) {
        expect(await listIds('c', 'sent', query)).not.toContain(requestId);
        expect(await listIds('c', 'received', query)).not.toContain(requestId);
      }
    });

    it('cannot get C past 404 on the detail or a document', async () => {
      const query = `?entityId=${a.entity.id}&providingEntityId=${b.entity.id}&requestingEntityId=${a.entity.id}`;
      await get('c', `/requests/${requestId}${query}`).expect(404);
      for (const documentId of documentIds) {
        await get(
          'c',
          `/requests/${requestId}/documents/${documentId}${query}`,
        ).expect(404);
      }
    });
  });

  describe('after B responds', () => {
    let ropaId: string;

    beforeAll(async () => {
      await respond('b', requestId).expect(201);
      const detail = await get('b', `/requests/${requestId}`).expect(200);
      ropaId = detail.body.providerResponse.ropaDocument.id;
    });

    it('C still gets 404 on the detail, every document and the response endpoint', async () => {
      await get('c', `/requests/${requestId}`).expect(404);
      for (const documentId of [...documentIds, ropaId]) {
        await get('c', `/requests/${requestId}/documents/${documentId}`).expect(
          404,
        );
      }
      await respond('c', requestId).expect(404);
    });

    it('A sees the new status but not the response', async () => {
      const res = await get('a', `/requests/${requestId}`).expect(200);
      expect(res.body.status).toBe('PROVIDER_RESPONDED');
      expect(res.body).not.toHaveProperty('providerResponse');
      await get('a', `/requests/${requestId}/documents/${ropaId}`).expect(404);
    });

    it("the lists are unchanged: A's sent and B's received only", async () => {
      expect(await listIds('a', 'sent')).toContain(requestId);
      expect(await listIds('b', 'received')).toContain(requestId);
      expect(await listIds('a', 'received')).not.toContain(requestId);
      expect(await listIds('b', 'sent')).not.toContain(requestId);
      expect(await listIds('c', 'sent')).not.toContain(requestId);
      expect(await listIds('c', 'received')).not.toContain(requestId);
    });
  });
});
