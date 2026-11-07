import type { Prisma, PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLAG_SOURCE_PROVIDER_OBJECTION } from '../requests/flag-reasons.js';
import { allocateReference } from '../requests/reference.js';
import type { StorageService } from '../storage/storage.interface.js';
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
  objection?: string;
}

// References come from the same per-year counter as real submissions, so
// the two never collide.
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
  {
    slug: 'gosi-hrsd',
    fromSlug: 'gosi',
    toSlug: 'hrsd',
    title: 'Employee wage records for contribution audits',
    responded: true,
    objection: 'The request does not state a legal basis for sharing wage records.',
  },
];

// Officers belong to SDAIA but act as reviewers, not for it (Sprint 2 spec
// §4.1).
const OFFICER_ENTITY_SLUG = 'sdaia';
const OFFICER_EMAIL = `officer@${OFFICER_ENTITY_SLUG}.example`;

async function uploadIfMissing(
  storage: StorageService,
  key: string,
  buffer: Buffer,
): Promise<void> {
  if (!(await storage.exists(key))) {
    await storage.put(key, buffer, 'application/pdf');
  }
}

// Creates whatever demo data is missing and leaves the rest alone, so running
// it again duplicates nothing and never alters a request or its decision
// (AGENTS.md -> Seed data rules). seed.ts is the script that runs it.
export async function seedDemoData(
  prisma: PrismaClient,
  storage: StorageService,
): Promise<void> {
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

  const officerEntityId = entityIdBySlug.get(OFFICER_ENTITY_SLUG);
  if (officerEntityId) {
    await prisma.user.upsert({
      where: { email: OFFICER_EMAIL },
      update: {
        isActive: true,
        entityId: officerEntityId,
        role: 'COMPLIANCE_OFFICER',
      },
      create: {
        email: OFFICER_EMAIL,
        entityId: officerEntityId,
        isActive: true,
        role: 'COMPLIANCE_OFFICER',
      },
    });
    console.log(`officer: ${OFFICER_EMAIL}`);
  } else {
    console.log(`skipping officer: ${OFFICER_ENTITY_SLUG} not in entities.json`);
  }

  for (const demo of DEMO_REQUESTS) {
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
          reference: await allocateReference(tx),
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
            position: demo.objection ? 'OBJECTED' : 'ENDORSED',
            objectionReason: demo.objection ?? null,
            respondedById,
          },
        });

        if (demo.objection) {
          await tx.flagReason.create({
            data: {
              requestId: request.id,
              source: FLAG_SOURCE_PROVIDER_OBJECTION,
              text: demo.objection,
            },
          });
        }
      }
    });

    console.log(`request: ${demo.title} (created)`);
  }
}
