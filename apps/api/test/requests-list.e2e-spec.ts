import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
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

describe('GET /requests (e2e)', () => {
  const prisma = new PrismaClient();
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let throttler: ResettableThrottlerStorage;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;
  let a: EntityFixture;
  let b: EntityFixture;
  let c: EntityFixture;
  let cookieA: string;
  // Request IDs, oldest first: A -> B, C -> A, A -> C, B -> C.
  let aToB: string;
  let cToA: string;
  let aToC: string;
  let bToC: string;

  // A request created `minutesAgo` minutes ago, so the order is certain.
  async function requestAt(
    from: EntityFixture,
    to: EntityFixture,
    title: string,
    minutesAgo: number,
  ): Promise<string> {
    const { request: req } = await createTestRequest(prisma, {
      from,
      to,
      title,
    });
    await prisma.dataSharingRequest.update({
      where: { id: req.id },
      data: { createdAt: new Date(Date.now() - minutesAgo * 60_000) },
    });
    return req.id;
  }

  const list = (cookie: string, query: string) =>
    request(app.getHttpServer())
      .get(`/api/requests${query}`)
      .set('Cookie', cookie);

  beforeAll(async () => {
    ({ app, mail, throttler } = await createTestApp());
    fixtures = await createEntityFixtures(prisma, 3);
    [a, b, c] = fixtures.entities;

    aToB = await requestAt(a, b, 'A to B', 40);
    cToA = await requestAt(c, a, 'C to A', 30);
    aToC = await requestAt(a, c, 'A to C', 20);
    bToC = await requestAt(b, c, 'B to C', 10);

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

  it('lists sent requests newest first, with the provider as counterpart', async () => {
    const res = await list(cookieA, '?direction=sent').expect(200);

    expect(res.body.map((r: { id: string }) => r.id)).toEqual([aToC, aToB]);
    const stored = await prisma.dataSharingRequest.findUniqueOrThrow({
      where: { id: aToC },
    });
    expect(res.body[0]).toEqual({
      id: aToC,
      reference: stored.reference,
      title: 'A to C',
      status: 'AWAITING_PROVIDER_RESPONSE',
      createdAt: stored.createdAt.toISOString(),
      counterpartEntity: { id: c.entity.id, name: c.entity.name },
    });
    expect(res.body[1].counterpartEntity).toEqual({
      id: b.entity.id,
      name: b.entity.name,
    });
  });

  it('lists received requests with the requester as counterpart', async () => {
    const res = await list(cookieA, '?direction=received').expect(200);

    expect(res.body.map((r: { id: string }) => r.id)).toEqual([cToA]);
    expect(res.body[0].counterpartEntity).toEqual({
      id: c.entity.id,
      name: c.entity.name,
    });
  });

  it("never includes other entities' requests", async () => {
    const sent = await list(cookieA, '?direction=sent').expect(200);
    const received = await list(cookieA, '?direction=received').expect(200);
    const ids = [...sent.body, ...received.body].map(
      (r: { id: string }) => r.id,
    );
    expect(ids).not.toContain(bToC);

    // C, as provider of B -> C and A -> C, sees both in received only.
    const cookieC = await loginAs(app, mail, c.dpo.email);
    const cReceived = await list(cookieC, '?direction=received').expect(200);
    expect(cReceived.body.map((r: { id: string }) => r.id)).toEqual([
      bToC,
      aToC,
    ]);
    const cSent = await list(cookieC, '?direction=sent').expect(200);
    expect(cSent.body.map((r: { id: string }) => r.id)).toEqual([cToA]);
  });

  it.each([
    ['a missing direction', ''],
    ['an unknown direction', '?direction=all'],
    ['a repeated direction', '?direction=sent&direction=received'],
  ])('returns 400 for %s', async (_case, query) => {
    const res = await list(cookieA, query).expect(400);
    expect(res.body).toEqual({
      message: 'direction must be sent or received.',
    });
  });

  it('returns 401 without a session', async () => {
    await request(app.getHttpServer())
      .get('/api/requests?direction=sent')
      .expect(401);
  });
});
