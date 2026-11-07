import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, type User } from '@prisma/client';
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
const OBJECTION = 'The legal basis for sharing is not stated.';
// Stands in for a Sprint 3 source: nothing in the app knows this identifier.
const MADE_UP_SOURCE = 'MADE_UP_COMPLIANCE_CHECK';
const UNKNOWN_ID = 'does-not-exist';
const ROLE_REFUSAL = { message: 'Not found.' };
const REQUEST_REFUSAL = { message: 'Request not found.' };

interface Row {
  id: string;
  status: string;
  flagged: boolean;
}

describe('Review console (e2e)', () => {
  const prisma = new PrismaClient();
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let throttler: ResettableThrottlerStorage;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;
  let sdaia: EntityFixture;
  let a: EntityFixture;
  let b: EntityFixture;
  let c: EntityFixture;
  let officer: User;
  const cookies = { officer: '', a: '', b: '', c: '', sdaia: '' };

  const get = (path: string, cookie: string) =>
    request(app.getHttpServer()).get(`/api${path}`).set('Cookie', cookie);

  const newRequest = (title: string, from = a, to = b) =>
    createTestRequest(prisma, { from, to, title });

  function respond(id: string, position: string, objectionReason?: string) {
    const req = request(app.getHttpServer())
      .post(`/api/requests/${id}/response`)
      .set('Cookie', cookies.b)
      .field('position', position);
    if (objectionReason) req.field('objectionReason', objectionReason);
    return req
      .attach('ropaDocument', ROPA_PDF, {
        filename: 'ropa-entry.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
  }

  const addReason = (requestId: string, source: string, text: string) =>
    prisma.flagReason.create({ data: { requestId, source, text } });

  const decide = (id: string, outcome: 'APPROVED' | 'REJECTED') =>
    request(app.getHttpServer())
      .post(`/api/review/requests/${id}/decision`)
      .set('Cookie', cookies.officer)
      .send({ outcome, justification: 'Reviewed against the PDPL.' })
      .expect(201);

  async function rows(query = ''): Promise<Row[]> {
    const res = await get(`/review/requests${query}`, cookies.officer).expect(
      200,
    );
    return res.body as Row[];
  }

  const ids = async (query = '') => (await rows(query)).map((r) => r.id);

  beforeAll(async () => {
    ({ app, mail, throttler } = await createTestApp());
    fixtures = await createEntityFixtures(prisma, 4);
    [sdaia, a, b, c] = fixtures.entities;
    officer = await createOfficer(prisma, sdaia);
    cookies.officer = await loginAs(app, mail, officer.email);
    cookies.a = await loginAs(app, mail, a.dpo.email);
    cookies.b = await loginAs(app, mail, b.dpo.email);
    cookies.c = await loginAs(app, mail, c.dpo.email);
    cookies.sdaia = await loginAs(app, mail, sdaia.dpo.email);
  });

  beforeEach(() => throttler.reset());

  afterAll(async () => {
    await fixtures.cleanup();
    await app.close();
    await prisma.$disconnect();
  });

  describe('the queue', () => {
    it('holds every pending and flagged request, from all entities, and nothing else', async () => {
      const pending = (await newRequest('Pending')).request;
      const otherEntities = (await newRequest('Other', c, a)).request;
      const objected = (await newRequest('Objected')).request;
      await respond(objected.id, 'OBJECTED', OBJECTION);
      const endorsed = (await newRequest('Endorsed')).request;
      await respond(endorsed.id, 'ENDORSED');
      const decided = (await newRequest('Decided')).request;
      await addReason(decided.id, MADE_UP_SOURCE, 'Reason.');
      await decide(decided.id, 'APPROVED');

      const queue = await ids();
      expect(queue).toEqual(
        expect.arrayContaining([pending.id, otherEntities.id, objected.id]),
      );
      expect(queue).not.toContain(endorsed.id);
      expect(queue).not.toContain(decided.id);
    });

    it('separates flagged requests from pending ones', async () => {
      const pending = (await newRequest('Pending')).request;
      const objected = (await newRequest('Objected')).request;
      await respond(objected.id, 'OBJECTED', OBJECTION);

      const flagged = await rows('?view=flagged');
      expect(flagged.map((r) => r.id)).toContain(objected.id);
      expect(flagged.map((r) => r.id)).not.toContain(pending.id);
      expect(flagged.every((r) => r.flagged)).toBe(true);

      const waiting = await rows('?view=pending');
      expect(waiting.map((r) => r.id)).toContain(pending.id);
      expect(waiting.map((r) => r.id)).not.toContain(objected.id);
      expect(waiting.every((r) => !r.flagged)).toBe(true);
    });

    it('treats a pending request with a flag reason as flagged only', async () => {
      const { request: both } = await newRequest('Flagged before a response');
      await addReason(both.id, MADE_UP_SOURCE, 'Reason.');

      await expect(ids('?view=flagged')).resolves.toContain(both.id);
      await expect(ids('?view=pending')).resolves.not.toContain(both.id);
    });

    it('sorts oldest first by default, and newest first on request', async () => {
      const older = (await newRequest('Older')).request;
      const newer = (await newRequest('Newer')).request;
      await prisma.dataSharingRequest.update({
        where: { id: older.id },
        data: { createdAt: new Date('2001-01-01T00:00:00Z') },
      });
      await prisma.dataSharingRequest.update({
        where: { id: newer.id },
        data: { createdAt: new Date('2001-01-02T00:00:00Z') },
      });

      const position = (list: string[]) => [
        list.indexOf(older.id),
        list.indexOf(newer.id),
      ];
      const [olderByDefault, newerByDefault] = position(await ids());
      expect(olderByDefault).toBeLessThan(newerByDefault);
      const [olderIfOldest, newerIfOldest] = position(
        await ids('?sort=oldest'),
      );
      expect(olderIfOldest).toBeLessThan(newerIfOldest);
      const [olderIfNewest, newerIfNewest] = position(
        await ids('?sort=newest'),
      );
      expect(newerIfNewest).toBeLessThan(olderIfNewest);
    });

    it('refuses an unknown view or sort', async () => {
      await get('/review/requests?view=endorsed', cookies.officer).expect(400);
      await get('/review/requests?sort=sideways', cookies.officer).expect(400);
    });

    it('never widens to a responded request, whatever view is asked for', async () => {
      const { request: endorsed } = await newRequest('Endorsed');
      await respond(endorsed.id, 'ENDORSED');

      for (const view of ['queue', 'flagged', 'pending', 'decided']) {
        await expect(ids(`?view=${view}`)).resolves.not.toContain(endorsed.id);
      }
    });

    it('flags a request straight after an objection', async () => {
      const { request: req } = await newRequest('Objected');
      const before = (await rows()).find((r) => r.id === req.id);
      expect(before?.flagged).toBe(false);

      await respond(req.id, 'OBJECTED', OBJECTION);

      const after = (await rows()).find((r) => r.id === req.id);
      expect(after?.flagged).toBe(true);
    });

    it('drops a request straight after an endorsement', async () => {
      const { request: req } = await newRequest('Endorsed');
      await expect(ids()).resolves.toContain(req.id);

      await respond(req.id, 'ENDORSED');

      await expect(ids()).resolves.not.toContain(req.id);
    });

    it('moves a decided request out of the queue, where it can still be found', async () => {
      const { request: req } = await newRequest('Decided');
      await respond(req.id, 'OBJECTED', OBJECTION);
      await expect(ids()).resolves.toContain(req.id);

      await decide(req.id, 'REJECTED');

      await expect(ids()).resolves.not.toContain(req.id);
      await expect(ids('?view=flagged')).resolves.not.toContain(req.id);
      const decided = (await rows('?view=decided')).find(
        (r) => r.id === req.id,
      );
      expect(decided).toMatchObject({ status: 'REJECTED', flagged: false });
      await get(`/review/requests/${req.id}`, cookies.officer).expect(200);
    });

    it('shows a request flagged only by another source, with no objection', async () => {
      const { request: req } = await newRequest('Other source');
      await respond(req.id, 'ENDORSED');
      await addReason(req.id, MADE_UP_SOURCE, 'Retention period is missing.');

      const row = (await rows('?view=flagged')).find((r) => r.id === req.id);
      expect(row?.flagged).toBe(true);
    });
  });

  describe('a case', () => {
    it('shows a pending request with nothing from the provider yet', async () => {
      const { request: req, requestForm } = await newRequest('Pending');

      const res = await get(
        `/review/requests/${req.id}`,
        cookies.officer,
      ).expect(200);

      expect(res.body).toMatchObject({
        id: req.id,
        reference: req.reference,
        title: 'Pending',
        status: 'AWAITING_PROVIDER_RESPONSE',
        flagged: false,
        requestingEntity: { id: a.entity.id, name: a.entity.name },
        providingEntity: { id: b.entity.id, name: b.entity.name },
        providerResponse: null,
        flagReasons: [],
      });
      expect(res.body.documents).toEqual([
        expect.objectContaining({
          id: requestForm.id,
          kind: 'REQUEST_FORM',
          originalName: 'request-form.pdf',
        }),
      ]);
    });

    it('shows the response, position and flag reason of an objected request', async () => {
      const { request: req } = await newRequest('Objected');
      await respond(req.id, 'OBJECTED', OBJECTION);

      const res = await get(
        `/review/requests/${req.id}`,
        cookies.officer,
      ).expect(200);

      expect(res.body.flagged).toBe(true);
      expect(res.body.providerResponse).toMatchObject({
        position: 'OBJECTED',
        objectionReason: OBJECTION,
        ropaDocument: { originalName: 'ropa-entry.pdf' },
      });
      expect(res.body.flagReasons).toEqual([
        {
          id: expect.any(String),
          source: FLAG_SOURCE_PROVIDER_OBJECTION,
          text: OBJECTION,
          createdAt: expect.any(String),
        },
      ]);
    });

    it('shows reasons from two sources, oldest first', async () => {
      const { request: req } = await newRequest('Two sources');
      await respond(req.id, 'OBJECTED', OBJECTION);
      await addReason(req.id, MADE_UP_SOURCE, 'Retention period is missing.');

      const res = await get(
        `/review/requests/${req.id}`,
        cookies.officer,
      ).expect(200);

      expect(
        (res.body.flagReasons as { source: string; text: string }[]).map(
          ({ source, text }) => ({ source, text }),
        ),
      ).toEqual([
        { source: FLAG_SOURCE_PROVIDER_OBJECTION, text: OBJECTION },
        { source: MADE_UP_SOURCE, text: 'Retention period is missing.' },
      ]);
    });

    it('shows a case with no objection and no response', async () => {
      const { request: req } = await newRequest('No objection');
      await addReason(req.id, MADE_UP_SOURCE, 'Retention period is missing.');

      const res = await get(
        `/review/requests/${req.id}`,
        cookies.officer,
      ).expect(200);

      expect(res.body.flagged).toBe(true);
      expect(res.body.providerResponse).toBeNull();
      expect(res.body.flagReasons).toHaveLength(1);
    });

    it('stays readable once decided, and is no longer flagged', async () => {
      const { request: req } = await newRequest('Decided');
      await respond(req.id, 'OBJECTED', OBJECTION);
      await decide(req.id, 'APPROVED');

      const res = await get(
        `/review/requests/${req.id}`,
        cookies.officer,
      ).expect(200);

      expect(res.body).toMatchObject({ status: 'APPROVED', flagged: false });
      expect(res.body.flagReasons).toHaveLength(1);
      expect(res.body.providerResponse.position).toBe('OBJECTED');
    });

    it('can be reached when SDAIA is a party', async () => {
      const { request: req } = await newRequest('From SDAIA', sdaia, b);

      await get(`/review/requests/${req.id}`, cookies.officer).expect(200);
    });

    it('is the same 404 for an endorsed request and an unknown ID', async () => {
      const { request: endorsed } = await newRequest('Endorsed');
      await respond(endorsed.id, 'ENDORSED');

      const closed = await get(
        `/review/requests/${endorsed.id}`,
        cookies.officer,
      ).expect(404);
      const unknown = await get(
        `/review/requests/${UNKNOWN_ID}`,
        cookies.officer,
      ).expect(404);

      expect(closed.body).toEqual(REQUEST_REFUSAL);
      expect(unknown.body).toEqual(closed.body);
    });
  });

  describe('case documents', () => {
    const download = (path: string) =>
      get(path, cookies.officer).buffer(true).responseType('blob');

    it('opens the request form and the RoPA entry', async () => {
      const { request: req, requestForm } = await newRequest('Objected');
      await respond(req.id, 'OBJECTED', OBJECTION);
      const { body } = await get(
        `/review/requests/${req.id}`,
        cookies.officer,
      ).expect(200);

      const form = await download(
        `/review/requests/${req.id}/documents/${requestForm.id}`,
      ).expect(200);
      expect(form.headers['content-type']).toContain('application/pdf');
      expect(form.headers['content-disposition']).toContain('attachment');
      expect(form.headers['x-content-type-options']).toBe('nosniff');

      const ropa = await download(
        `/review/requests/${req.id}/documents/${body.providerResponse.ropaDocument.id}`,
      ).expect(200);
      expect(Buffer.compare(ropa.body as Buffer, ROPA_PDF)).toBe(0);
    });

    it("won't open another request's document through this case", async () => {
      const { request: req } = await newRequest('This case');
      const { requestForm: other } = await newRequest('Other case');

      await get(
        `/review/requests/${req.id}/documents/${other.id}`,
        cookies.officer,
      ).expect(404);
    });

    it('is the same 404 on a closed request as on an unknown one', async () => {
      const { request: endorsed, requestForm } = await newRequest('Endorsed');
      await respond(endorsed.id, 'ENDORSED');

      const closed = await get(
        `/review/requests/${endorsed.id}/documents/${requestForm.id}`,
        cookies.officer,
      ).expect(404);
      const unknown = await get(
        `/review/requests/${UNKNOWN_ID}/documents/${requestForm.id}`,
        cookies.officer,
      ).expect(404);

      expect(closed.body).toEqual(REQUEST_REFUSAL);
      expect(unknown.body).toEqual(closed.body);
    });
  });

  describe('everyone but an officer', () => {
    it('needs a session', async () => {
      const { request: req, requestForm } = await newRequest('Pending');

      const server = request(app.getHttpServer());
      await server.get(`/api/review/requests/${req.id}`).expect(401);
      await server
        .get(`/api/review/requests/${req.id}/documents/${requestForm.id}`)
        .expect(401);
    });

    it('gets the same refusal from every DPO, whether or not the request is flagged or exists', async () => {
      const pending = await newRequest('Pending');
      const objected = await newRequest('Objected');
      await respond(objected.request.id, 'OBJECTED', OBJECTION);
      const endorsed = await newRequest('Endorsed');
      await respond(endorsed.request.id, 'ENDORSED');

      const paths = [
        ...[pending, objected, endorsed].flatMap(
          ({ request: r, requestForm }) => [
            `/review/requests/${r.id}`,
            `/review/requests/${r.id}/documents/${requestForm.id}`,
          ],
        ),
        `/review/requests/${UNKNOWN_ID}`,
        `/review/requests/${UNKNOWN_ID}/documents/${UNKNOWN_ID}`,
      ];

      for (const cookie of [cookies.a, cookies.b, cookies.c, cookies.sdaia]) {
        for (const path of paths) {
          const res = await get(path, cookie).expect(404);
          expect(res.body).toEqual(ROLE_REFUSAL);
        }
      }
    });

    it('gains nothing from values the client sends', async () => {
      const { request: req } = await newRequest('Objected');
      await respond(req.id, 'OBJECTED', OBJECTION);

      const res = await get(
        `/review/requests/${req.id}?role=COMPLIANCE_OFFICER&userId=${officer.id}&entityId=${sdaia.entity.id}`,
        cookies.a,
      )
        .set('X-Role', 'COMPLIANCE_OFFICER')
        .set('X-User-Id', officer.id)
        .expect(404);

      expect(res.body).toEqual(ROLE_REFUSAL);
    });

    it('keeps the requester from learning of the objection', async () => {
      const { request: req } = await newRequest('Objected');
      await respond(req.id, 'OBJECTED', OBJECTION);
      const { body } = await get(
        `/review/requests/${req.id}`,
        cookies.officer,
      ).expect(200);

      const detail = await get(`/requests/${req.id}`, cookies.a).expect(200);
      expect(detail.body).not.toHaveProperty('flagged');
      expect(detail.body).not.toHaveProperty('flagReasons');
      expect(detail.body).not.toHaveProperty('providerResponse');
      expect(JSON.stringify(detail.body)).not.toContain(OBJECTION);

      await get(
        `/requests/${req.id}/documents/${body.providerResponse.ropaDocument.id}`,
        cookies.a,
      ).expect(404);
    });
  });
});
