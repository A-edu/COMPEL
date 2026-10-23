import { NestFactory } from '@nestjs/core';
import type { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.interface.js';
import { buildPlaceholderPdf } from './placeholder-pdf.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SeedEntity {
  name: string;
  slug: string;
}

interface DemoRequest {
  slug: string;
  fromSlug: string;
  toSlug: string;
  title: string;
  responded: boolean;
}

// §9 (out of scope here) must account for these reserved references when it
// builds the real per-year reference counter.
const DEMO_REQUESTS: DemoRequest[] = [
  {
    slug: 'moh-zatca',
    fromSlug: 'moh',
    toSlug: 'zatca',
    title: 'Supplier tax compliance verification',
    responded: false,
  },
  {
    slug: 'zatca-gosi',
    fromSlug: 'zatca',
    toSlug: 'gosi',
    title: 'Employer contribution records',
    responded: false,
  },
  {
    slug: 'hrsd-moh',
    fromSlug: 'hrsd',
    toSlug: 'moh',
    title: 'Occupational health records for labour inspections',
    responded: true,
  },
];

function reference(year: number, sequence: number): string {
  return `CMP-${year}-${sequence.toString().padStart(6, '0')}`;
}

async function uploadIfMissing(
  storage: StorageService,
  key: string,
  buffer: Buffer,
): Promise<void> {
  if (!(await storage.exists(key))) {
    await storage.put(key, buffer, 'application/pdf');
  }
}

async function run(): Promise<void> {
  if (process.env.DEMO_MODE !== 'true') {
    console.error('Refusing to seed: DEMO_MODE is not "true".');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const storage = app.get<StorageService>(STORAGE_SERVICE);

    const entitiesPath = join(__dirname, '..', '..', 'prisma', 'seed', 'entities.json');
    const entities: SeedEntity[] = JSON.parse(readFileSync(entitiesPath, 'utf-8'));

    const entityIdBySlug = new Map<string, string>();
    const dpoIdBySlug = new Map<string, string>();

    for (const { name, slug } of entities) {
      const entity = await prisma.entity.upsert({
        where: { slug },
        update: { name, dataOfficeEmail: `dmo@${slug}.example` },
        create: { name, slug, dataOfficeEmail: `dmo@${slug}.example` },
      });
      entityIdBySlug.set(slug, entity.id);

      const dpo = await prisma.user.upsert({
        where: { email: `dpo@${slug}.example` },
        update: { isActive: true, entityId: entity.id },
        create: {
          email: `dpo@${slug}.example`,
          entityId: entity.id,
          isActive: true,
        },
      });
      dpoIdBySlug.set(slug, dpo.id);

      console.log(`entity: ${slug} (${name})`);
    }

    const year = new Date().getFullYear();

    for (const [index, demo] of DEMO_REQUESTS.entries()) {
      const requestingEntityId = entityIdBySlug.get(demo.fromSlug);
      const providingEntityId = entityIdBySlug.get(demo.toSlug);
      const submittedById = dpoIdBySlug.get(demo.fromSlug);
      const respondedById = dpoIdBySlug.get(demo.toSlug);

      if (!requestingEntityId || !providingEntityId || !submittedById || !respondedById) {
        console.log(`skipping demo request "${demo.title}": entity not in entities.json`);
        continue;
      }

      const existing = await prisma.dataSharingRequest.findFirst({
        where: { title: demo.title, requestingEntityId, providingEntityId },
      });

      if (existing) {
        console.log(`request: ${demo.title} (already exists)`);
        continue;
      }

      const requestFormKey = `seed/${demo.slug}/request-form.pdf`;
      await uploadIfMissing(
        storage,
        requestFormKey,
        buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', `Request form: ${demo.title}`]),
      );

      let ropaKey: string | null = null;
      if (demo.responded) {
        ropaKey = `seed/${demo.slug}/ropa.pdf`;
        await uploadIfMissing(
          storage,
          ropaKey,
          buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', `RoPA entry: ${demo.title}`]),
        );
      }

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const request = await tx.dataSharingRequest.create({
          data: {
            reference: reference(year, index + 1),
            title: demo.title,
            requestingEntityId,
            providingEntityId,
            submittedById,
            status: demo.responded ? 'PROVIDER_RESPONDED' : 'AWAITING_PROVIDER_RESPONSE',
          },
        });

        await tx.document.create({
          data: {
            requestId: request.id,
            kind: 'REQUEST_FORM',
            storageKey: requestFormKey,
            originalName: 'request-form.pdf',
            mimeType: 'application/pdf',
            sizeBytes: Buffer.byteLength(
              buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', `Request form: ${demo.title}`]),
            ),
            uploadedById: submittedById,
          },
        });

        if (demo.responded && ropaKey) {
          const ropaDocument = await tx.document.create({
            data: {
              requestId: request.id,
              kind: 'ROPA',
              storageKey: ropaKey,
              originalName: 'ropa.pdf',
              mimeType: 'application/pdf',
              sizeBytes: Buffer.byteLength(
                buildPlaceholderPdf(['SYNTHETIC — DEMO DATA', `RoPA entry: ${demo.title}`]),
              ),
              uploadedById: respondedById,
            },
          });

          await tx.providerResponse.create({
            data: {
              requestId: request.id,
              ropaDocumentId: ropaDocument.id,
              position: 'ENDORSED',
              respondedById,
            },
          });
        }
      });

      console.log(`request: ${demo.title} (created)`);
    }
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
