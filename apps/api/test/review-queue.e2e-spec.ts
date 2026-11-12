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

// The review queue's read-only additions for the design (officer routes only):
// slugs, waiting times, flag sources, outcomes, the entity filter, both sorts,
// the counts and the entity list. Party routes must carry none of them.

const ROPA_PDF = buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', 'RoPA entry']);
const OBJECTION = 'The legal basis for sharing is not stated.';
// Stands in for a Sprint 3 source: nothing in the app knows this identifier.
const MADE_UP_SOURCE = 'MADE_UP_COMPLIANCE_CHECK';
const OFFICER_ONLY_KEYS = [
  'slug',
  'waitingSince',
  'flagSources',
  'outcome',
  'decidedAt',
  'counts',
  'entities',
];

interface Item {
  id: string;
  status: string;
  flagged: boolean;
  createdAt: string;
  requestingEntity: { id: string; name: string; slug: string };
  providingEntity: { id: string; name: string; slug: string };
  waitingSince?: string;
  flagSources?: string[];
  outcome?: string;
  decidedAt?: string;
}

interface Queue {
  items: Item[];
  counts: { flagged: number; pending: number; queue: number };
  entities: { id: string; name: string; slug: string }[];
}

// Every key anywhere in a JSON value.
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => [
      key,
      ...keysOf(inner),
    ]);
  }
  return [];
}

describe('Review queue: fields, entity filter, sorts and counts (e2e)', () => {
  const prisma = new PrismaClient();
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let throttler: ResettableThrottlerStorage;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;
  let all: EntityFixture[];
  let sdaia: EntityFixture;
  let a: EntityFixture;
  let b: EntityFixture;
  let officer: User;
  const cookies = { officer: '', a: '', b: '' };

  const get = (path: string, cookie: string) =>
    request(app.getHttpServer()).get(`/api${path}`).set('Cookie', cookie);

  async function queue(query = ''): Promise<Queue> {
    const res = await get(`/review/requests${query}`, cookies.officer).expect(
      200,
    );
    return res.body as Queue;
  }

  const ids = async (query = '') =>
    (await queue(query)).items.map((item) => item.id);

  const newRequest = (title: string, from = a, to = b) =>
    createTestRequest(prisma, { from, to, title });

  const setCreatedAt = (id: string, iso: string) =>
    prisma.dataSharingRequest.update({
      where: { id },
      data: { createdAt: new Date(iso) },
    });

  const addReason = (
    requestId: string,
    source: string,
    createdAt?: string,
  ) =>
    prisma.flagReason.create({
      data: {
        requestId,
        source,
        text: 'Reason.',
        ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
      },
    });

  const decide = (id: string, outcome: 'APPROVED' | 'REJECTED') =>
    request(app.getHttpServer())
      .post(`/api/review/requests/${id}/decision`)
      .set('Cookie', cookies.officer)
      .send({ outcome, justification: 'Reviewed against the PDPL.' })
      .expect(201);

  // b's DPO objects to a request from a.
  const object = (id: string) =>
    request(app.getHttpServer())
      .post(`/api/requests/${id}/response`)
      .set('Cookie', cookies.b)
      .field('position', 'OBJECTED')
      .field('objectionReason', OBJECTION)
      .attach('ropaDocument', ROPA_PDF, {
        filename: 'ropa-entry.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

  // A pair of entities no other test uses, so filtering by one of them gives
  // exact results.
  let nextPair = 3;
  function freshPair(): [EntityFixture, EntityFixture] {
    const pair: [EntityFixture, EntityFixture] = [
      all[nextPair],
      all[nextPair + 1],
    ];
    nextPair += 2;
    return pair;
  }

  beforeAll(async () => {
    ({ app, mail, throttler } = await createTestApp());
    fixtures = await createEntityFixtures(prisma, 15);
    all = fixtures.entities;
    [sdaia, a, b] = all;
    officer = await createOfficer(prisma, sdaia);
    cookies.officer = await loginAs(app, mail, officer.email);
    cookies.a = await loginAs(app, mail, a.dpo.email);
    cookies.b = await loginAs(app, mail, b.dpo.email);
  });

  beforeEach(() => throttler.reset());

  afterAll(async () => {
    await fixtures.cleanup();
    await app.close();
    await prisma.$disconnect();
  });

  describe('rows and the case', () => {
    it('give both parties their slug', async () => {
      const { request: req } = await newRequest('Slugs');

      const row = (await queue()).items.find((item) => item.id === req.id);
      expect(row).toMatchObject({
        requestingEntity: { id: a.entity.id, slug: a.entity.slug },
        providingEntity: { id: b.entity.id, slug: b.entity.slug },
      });

      const res = await get(`/review/requests/${req.id}`, cookies.officer)
        .expect(200);
      expect(res.body).toMatchObject({
        requestingEntity: {
          id: a.entity.id,
          name: a.entity.name,
          slug: a.entity.slug,
        },
        providingEntity: {
          id: b.entity.id,
          name: b.entity.name,
          slug: b.entity.slug,
        },
      });
    });

    it('wait on the provider from submission while pending', async () => {
      const { request: req } = await newRequest('Pending');
      await setCreatedAt(req.id, '2001-02-03T04:05:06.000Z');

      const row = (await queue('?view=pending')).items.find(
        (item) => item.id === req.id,
      );
      expect(row?.waitingSince).toBe('2001-02-03T04:05:06.000Z');
      expect(row).not.toHaveProperty('flagSources');
      expect(row).not.toHaveProperty('outcome');
      expect(row).not.toHaveProperty('decidedAt');
    });

    it('wait on a decision from the first flag reason, with distinct sources oldest first', async () => {
      const { request: req } = await newRequest('Flagged');
      await setCreatedAt(req.id, '2001-01-01T00:00:00.000Z');
      await addReason(req.id, MADE_UP_SOURCE, '2001-01-05T00:00:00.000Z');
      await addReason(
        req.id,
        FLAG_SOURCE_PROVIDER_OBJECTION,
        '2001-01-03T00:00:00.000Z',
      );
      await addReason(req.id, MADE_UP_SOURCE, '2001-01-04T00:00:00.000Z');

      const row = (await queue('?view=flagged')).items.find(
        (item) => item.id === req.id,
      );
      expect(row?.waitingSince).toBe('2001-01-03T00:00:00.000Z');
      expect(row?.flagSources).toEqual([
        FLAG_SOURCE_PROVIDER_OBJECTION,
        MADE_UP_SOURCE,
      ]);
      expect(row).not.toHaveProperty('outcome');
      expect(row).not.toHaveProperty('decidedAt');
    });

    it('show a decision with its outcome, time and only the sources that led to it', async () => {
      const { request: req } = await newRequest('Decided');
      await object(req.id);
      await decide(req.id, 'REJECTED');
      // A reason that arrives after the decision does not count towards it.
      await addReason(
        req.id,
        MADE_UP_SOURCE,
        new Date(Date.now() + 60_000).toISOString(),
      );
      const decision = await prisma.decision.findUniqueOrThrow({
        where: { requestId: req.id },
      });

      const row = (await queue('?view=decided')).items.find(
        (item) => item.id === req.id,
      );
      expect(row).toMatchObject({
        status: 'REJECTED',
        flagged: false,
        outcome: 'REJECTED',
        decidedAt: decision.createdAt.toISOString(),
        flagSources: [FLAG_SOURCE_PROVIDER_OBJECTION],
      });
      expect(row).not.toHaveProperty('waitingSince');
    });
  });

  describe('the entity filter', () => {
    it('matches an entity as the requester or as the provider', async () => {
      const [c, d] = freshPair();
      const [e] = freshPair();
      const cToD = (await newRequest('c to d', c, d)).request;
      const dToE = (await newRequest('d to e', d, e)).request;
      const eToC = (await newRequest('e to c', e, c)).request;

      const forD = await ids(`?entity=${d.entity.id}`);
      expect(forD.sort()).toEqual([cToD.id, dToE.id].sort());
      const forC = await ids(`?entity=${c.entity.id}`);
      expect(forC.sort()).toEqual([cToD.id, eToC.id].sort());
    });

    it('matches nothing for an unknown entity', async () => {
      await newRequest('Exists');

      const result = await queue('?entity=does-not-exist');
      expect(result.items).toEqual([]);
      expect(result.counts).toEqual({ flagged: 0, pending: 0, queue: 0 });
    });

    it('refuses a blank or overlong entity', async () => {
      await get('/review/requests?entity=', cookies.officer).expect(400);
      await get(
        `/review/requests?entity=${'x'.repeat(65)}`,
        cookies.officer,
      ).expect(400);
    });

    it('never widens past the officer scope', async () => {
      const [c, d] = freshPair();
      const { request: endorsed } = await newRequest('Responded', c, d);
      await prisma.dataSharingRequest.update({
        where: { id: endorsed.id },
        data: { status: 'PROVIDER_RESPONDED' },
      });

      for (const view of ['queue', 'flagged', 'pending', 'decided']) {
        const result = await queue(`?view=${view}&entity=${c.entity.id}`);
        expect(result.items).toEqual([]);
      }
    });
  });

  describe('sorting', () => {
    it('lists the longest wait first, or the most recent, by waiting time rather than submission', async () => {
      const [c, d] = freshPair();
      // Submitted first, but flagged only after the pending one was submitted.
      const flagged = (await newRequest('Flagged later', c, d)).request;
      await setCreatedAt(flagged.id, '2002-01-01T00:00:00.000Z');
      await addReason(flagged.id, MADE_UP_SOURCE, '2002-01-03T00:00:00.000Z');
      const pending = (await newRequest('Pending', c, d)).request;
      await setCreatedAt(pending.id, '2002-01-02T00:00:00.000Z');

      const filter = `entity=${c.entity.id}`;
      await expect(ids(`?${filter}`)).resolves.toEqual([
        pending.id,
        flagged.id,
      ]);
      await expect(ids(`?${filter}&sort=longest`)).resolves.toEqual([
        pending.id,
        flagged.id,
      ]);
      await expect(ids(`?${filter}&sort=recent`)).resolves.toEqual([
        flagged.id,
        pending.id,
      ]);
    });

    it('lists the newest decision first in the decided view, whatever the sort', async () => {
      const [c, d] = freshPair();
      const earlier = (await newRequest('Decided earlier', c, d)).request;
      const later = (await newRequest('Decided later', c, d)).request;
      for (const req of [earlier, later]) {
        await addReason(req.id, MADE_UP_SOURCE);
        await decide(req.id, 'APPROVED');
      }
      // The later request was submitted first, so submission order would differ.
      await setCreatedAt(later.id, '2003-01-01T00:00:00.000Z');
      await setCreatedAt(earlier.id, '2003-01-02T00:00:00.000Z');
      await prisma.decision.update({
        where: { requestId: earlier.id },
        data: { createdAt: new Date('2003-02-01T00:00:00.000Z') },
      });
      await prisma.decision.update({
        where: { requestId: later.id },
        data: { createdAt: new Date('2003-02-02T00:00:00.000Z') },
      });

      for (const sort of ['', '&sort=longest', '&sort=recent']) {
        await expect(
          ids(`?view=decided&entity=${c.entity.id}${sort}`),
        ).resolves.toEqual([later.id, earlier.id]);
      }
    });
  });

  describe('counts', () => {
    it('count the open views with the entity filter, whatever view is listed', async () => {
      const [c, d] = freshPair();
      await newRequest('Pending 1', c, d);
      await newRequest('Pending 2', d, c);
      const flagged = (await newRequest('Flagged', c, d)).request;
      await addReason(flagged.id, MADE_UP_SOURCE);
      const decided = (await newRequest('Decided', c, d)).request;
      await addReason(decided.id, MADE_UP_SOURCE);
      await decide(decided.id, 'APPROVED');
      const responded = (await newRequest('Responded', c, d)).request;
      await prisma.dataSharingRequest.update({
        where: { id: responded.id },
        data: { status: 'PROVIDER_RESPONDED' },
      });

      for (const view of ['queue', 'flagged', 'pending', 'decided']) {
        const result = await queue(`?view=${view}&entity=${c.entity.id}`);
        expect(result.counts).toEqual({ flagged: 1, pending: 2, queue: 3 });
      }
    });

    it('match what each open view lists, with no filter', async () => {
      const { request: flagged } = await newRequest('Flagged');
      await addReason(flagged.id, MADE_UP_SOURCE);
      await newRequest('Pending');

      const { counts } = await queue();
      for (const view of ['queue', 'flagged', 'pending'] as const) {
        const { items } = await queue(`?view=${view}`);
        expect(counts[view]).toBe(items.length);
      }
    });
  });

  it('lists every entity for the filter, by name', async () => {
    const { entities } = await queue();

    for (const { entity } of all) {
      expect(entities).toContainEqual({
        id: entity.id,
        name: entity.name,
        slug: entity.slug,
      });
    }
    const names = entities.map((entity) => entity.name);
    expect(names).toEqual([...names].sort((x, y) => (x < y ? -1 : 1)));
  });

  it("gives a DPO's routes none of the officer-only fields", async () => {
    const { request: flagged } = await newRequest('Flagged for the parties');
    await object(flagged.id);
    const { request: decided } = await newRequest('Decided for the parties');
    await object(decided.id);
    await decide(decided.id, 'APPROVED');
    const { request: pending } = await newRequest('Pending for the parties');

    const responses = [
      await get('/requests?direction=sent', cookies.a).expect(200),
      await get('/requests?direction=received', cookies.b).expect(200),
    ];
    for (const { id } of [flagged, decided, pending]) {
      responses.push(await get(`/requests/${id}`, cookies.a).expect(200));
      responses.push(await get(`/requests/${id}`, cookies.b).expect(200));
    }

    for (const res of responses) {
      const keys = keysOf(res.body);
      for (const key of OFFICER_ONLY_KEYS) expect(keys).not.toContain(key);
    }
  });
});
