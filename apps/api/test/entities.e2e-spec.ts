import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import {
  createTestApp,
  loginAs,
  type MockMailTransport,
} from './auth-helpers.js';
import { createEntityFixtures } from './fixtures.js';

describe('GET /entities (e2e)', () => {
  const prisma = new PrismaClient();
  let app: NestExpressApplication;
  let mail: MockMailTransport;
  let fixtures: Awaited<ReturnType<typeof createEntityFixtures>>;

  beforeAll(async () => {
    ({ app, mail } = await createTestApp());
    fixtures = await createEntityFixtures(prisma, 3);
  });

  afterAll(async () => {
    await fixtures?.cleanup();
    await app?.close();
    await prisma.$disconnect();
  });

  it("lists every other entity by name, without the caller's own", async () => {
    const [a, b, c] = fixtures.entities;
    const cookie = await loginAs(app, mail, b.dpo.email);

    const res = await request(app.getHttpServer())
      .get('/api/entities')
      .set('Cookie', cookie)
      .expect(200);

    // The test schema holds only these fixtures (database.e2e-spec).
    expect(res.body).toEqual(
      [a, c].map(({ entity }) => ({
        id: entity.id,
        name: entity.name,
        slug: entity.slug,
      })),
    );
  });

  it('returns 401 without a session', async () => {
    await request(app.getHttpServer()).get('/api/entities').expect(401);
  });
});
