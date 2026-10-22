import { PrismaClient } from '@prisma/client';

describe('Database (e2e)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects to the test schema and finds it empty', async () => {
    await expect(prisma.entity.count()).resolves.toBe(0);
  });
});
