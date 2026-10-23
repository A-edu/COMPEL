import type { ConfigService } from '@nestjs/config';
import type { Entity, PrismaClient, User } from '@prisma/client';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { buildPlaceholderPdf } from '../src/seed/placeholder-pdf.js';
import { LocalStorageDriver } from '../src/storage/local-storage.driver.js';
import type { StorageService } from '../src/storage/storage.interface.js';

export interface EntityFixture {
  entity: Entity;
  dpo: User;
}

// The same UPLOAD_DIR the test app writes to (set by setup-e2e.ts).
function localStorage(): StorageService {
  return new LocalStorageDriver({
    get: (name: string) => process.env[name],
  } as unknown as ConfigService);
}

// `count` entities, each with one active DPO. cleanup() removes them and
// everything a test created between them: provider responses, documents
// (and their files, one at a time), requests, sessions, OTPs and auth
// events. It can be called more than once.
//
//   const { entities: [a, b, c], cleanup } = await createEntityFixtures(prisma, 3);
export async function createEntityFixtures(
  prisma: PrismaClient,
  count: number,
) {
  const run = randomBytes(4).toString('hex');
  const entities: EntityFixture[] = [];
  for (let i = 0; i < count; i++) {
    const slug = `e2e-${run}-${String.fromCharCode(97 + i)}`;
    const entity = await prisma.entity.create({
      data: {
        name: `E2E Entity ${slug}`,
        slug,
        dataOfficeEmail: `dmo@${slug}.example`,
      },
    });
    const dpo = await prisma.user.create({
      data: { email: `dpo@${slug}.example`, entityId: entity.id },
    });
    entities.push({ entity, dpo });
  }

  const cleanup = async () => {
    const entityIds = entities.map((f) => f.entity.id);
    const users = await prisma.user.findMany({
      where: { entityId: { in: entityIds } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    const requests = await prisma.dataSharingRequest.findMany({
      where: {
        OR: [
          { requestingEntityId: { in: entityIds } },
          { providingEntityId: { in: entityIds } },
        ],
      },
      select: { id: true },
    });
    const requestIds = requests.map((r) => r.id);

    await prisma.providerResponse.deleteMany({
      where: { requestId: { in: requestIds } },
    });
    const documents = await prisma.document.findMany({
      where: { requestId: { in: requestIds } },
      select: { storageKey: true },
    });
    // One file at a time, never by prefix (AGENTS.md -> Architecture).
    const storage = localStorage();
    for (const { storageKey } of documents) await storage.delete(storageKey);
    await prisma.document.deleteMany({
      where: { requestId: { in: requestIds } },
    });
    await prisma.dataSharingRequest.deleteMany({
      where: { id: { in: requestIds } },
    });

    await prisma.authEvent.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          ...entities.map((f) => ({
            email: { endsWith: `@${f.entity.slug}.example` },
          })),
        ],
      },
    });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.otpChallenge.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
  };

  return { entities, cleanup };
}

// A request from `from` to `to`, written straight to the test database with
// a placeholder request-form PDF, as if submitted by `from`'s DPO. Removed by
// the fixtures' cleanup(). The reference uses year 9999, which real
// reference generation never produces, so it cannot collide.
export async function createTestRequest(
  prisma: PrismaClient,
  {
    from,
    to,
    title = 'E2E test request',
  }: { from: EntityFixture; to: EntityFixture; title?: string },
) {
  const pdf = buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', title]);
  const storageKey = `documents/${randomUUID()}.pdf`;
  await localStorage().put(storageKey, pdf, 'application/pdf');

  const request = await prisma.dataSharingRequest.create({
    data: {
      reference: `CMP-9999-${randomInt(0, 1_000_000).toString().padStart(6, '0')}`,
      title,
      requestingEntityId: from.entity.id,
      providingEntityId: to.entity.id,
      submittedById: from.dpo.id,
      documents: {
        create: {
          kind: 'REQUEST_FORM',
          storageKey,
          originalName: 'request-form.pdf',
          mimeType: 'application/pdf',
          sizeBytes: pdf.length,
          uploadedById: from.dpo.id,
        },
      },
    },
    include: { documents: true },
  });
  const { documents, ...rest } = request;
  return { request: rest, requestForm: documents[0] };
}
