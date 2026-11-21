import { Test } from '@nestjs/testing';
import type { INestApplicationContext } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppModule } from '../src/app.module.js';
import { MAIL_TRANSPORT } from '../src/mail/mail.transport.js';
import { MODEL_CLIENT } from '../src/pipeline/model/model-client.js';
import { StandInModelClient } from '../src/pipeline/model/stand-in-model-client.js';
import type { PipelineStep } from '../src/pipeline/pipeline-steps.js';
import { PipelineSweeper } from '../src/pipeline/pipeline-sweeper.service.js';
import { RULE_SET_VERSION } from '../src/pipeline/pipeline.constants.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { seedDemoData } from '../src/seed/seed-data.js';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../src/storage/storage.interface.js';
import { createTestApp, MockMailTransport } from './auth-helpers.js';
import {
  createEntityFixtures,
  createTestRequest,
  removeEntities,
} from './fixtures.js';

// Sprint 3 spec §5.7: existing data, the seed and starting the app.

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(__dirname, '..');
// The last migration of Sprint 2: the published app's schema before Sprint 3.
const SPRINT_2_LAST_MIGRATION = '20261107133439_decisions';

// The status, flag reasons, decision and response of every request: what an
// upgrade must not change.
async function snapshot(prisma: PrismaClient) {
  return prisma.dataSharingRequest.findMany({
    orderBy: { reference: 'asc' },
    select: {
      reference: true,
      status: true,
      flagReasons: {
        orderBy: { createdAt: 'asc' },
        select: { source: true, text: true, createdAt: true },
      },
      decision: {
        select: {
          outcome: true,
          justification: true,
          decidedById: true,
          createdAt: true,
        },
      },
      providerResponse: {
        select: { position: true, objectionReason: true, createdAt: true },
      },
    },
  });
}

describe('Migrating Sprint 2 data (e2e)', () => {
  const schema = `e2e_migration_${randomBytes(4).toString('hex')}`;
  let url: string;
  let workDir: string;
  let db: PrismaClient;

  // Applies the migrations in `names` (and nothing else) to the throwaway
  // schema, the way the published app does on start.
  async function deploy(names: string[]) {
    const migrations = join(workDir, 'migrations');
    await mkdir(migrations, { recursive: true });
    for (const name of names) {
      await cp(
        join(API_DIR, 'prisma', 'migrations', name),
        join(migrations, name),
        {
          recursive: true,
        },
      );
    }
    execFileSync(
      'npx',
      [
        'prisma',
        'migrate',
        'deploy',
        '--schema',
        join(workDir, 'schema.prisma'),
      ],
      {
        cwd: API_DIR,
        env: { ...process.env, DATABASE_URL: url },
        stdio: 'pipe',
      },
    );
  }

  beforeAll(async () => {
    const parsed = new URL(process.env.DATABASE_URL!);
    parsed.searchParams.set('schema', schema);
    url = parsed.toString();
    workDir = await mkdtemp(join(tmpdir(), 'compel-migration-'));
    await copyFile(
      join(API_DIR, 'prisma', 'schema.prisma'),
      join(workDir, 'schema.prisma'),
    );
    await mkdir(join(workDir, 'migrations'));
    await copyFile(
      join(API_DIR, 'prisma', 'migrations', 'migration_lock.toml'),
      join(workDir, 'migrations', 'migration_lock.toml'),
    );
    db = new PrismaClient({ datasources: { db: { url } } });
  });

  afterAll(async () => {
    // Only the schema this test created.
    if (/^e2e_migration_[0-9a-f]{8}$/.test(schema)) {
      await db?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
    await db?.$disconnect();
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('changes no status, flag reason or decision, and starts no run', async () => {
    const all = (await readdir(join(API_DIR, 'prisma', 'migrations')))
      .filter((name) => /^\d{14}_/.test(name))
      .sort();
    const sprint2 = all.filter((name) => name <= SPRINT_2_LAST_MIGRATION);
    const sprint3 = all.filter((name) => name > SPRINT_2_LAST_MIGRATION);
    expect(sprint2.at(-1)).toBe(SPRINT_2_LAST_MIGRATION);
    expect(sprint3.length).toBeGreaterThan(0);

    await deploy(sprint2);

    // Sprint 2 data: one request in each state it could be in.
    const [x, y] = await Promise.all(
      ['x', 'y'].map((s) =>
        db.entity.create({
          data: {
            name: `Migration ${schema} ${s}`,
            slug: `${schema}-${s}`,
            dataOfficeEmail: `dmo@${schema}-${s}.example`,
          },
        }),
      ),
    );
    const dpoX = await db.user.create({
      data: { email: `dpo@${schema}-x.example`, entityId: x.id },
    });
    const dpoY = await db.user.create({
      data: { email: `dpo@${schema}-y.example`, entityId: y.id },
    });
    const officer = await db.user.create({
      data: {
        email: `officer@${schema}-y.example`,
        entityId: y.id,
        role: 'COMPLIANCE_OFFICER',
      },
    });
    const make = async (
      n: number,
      status: 'AWAITING_PROVIDER_RESPONSE' | 'PROVIDER_RESPONDED' | 'REJECTED',
      response?: { objection?: string },
    ) => {
      const req = await db.dataSharingRequest.create({
        data: {
          reference: `CMP-9998-00000${n}`,
          title: `Sprint 2 request ${n}`,
          requestingEntityId: x.id,
          providingEntityId: y.id,
          submittedById: dpoX.id,
          status,
        },
      });
      if (response) {
        const ropa = await db.document.create({
          data: {
            requestId: req.id,
            kind: 'ROPA',
            storageKey: `documents/${schema}-${n}.pdf`,
            originalName: 'ropa.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 10,
            uploadedById: dpoY.id,
          },
        });
        await db.providerResponse.create({
          data: {
            requestId: req.id,
            ropaDocumentId: ropa.id,
            position: response.objection ? 'OBJECTED' : 'ENDORSED',
            objectionReason: response.objection ?? null,
            respondedById: dpoY.id,
          },
        });
        if (response.objection) {
          await db.flagReason.create({
            data: {
              requestId: req.id,
              source: 'PROVIDER_OBJECTION',
              text: response.objection,
            },
          });
        }
      }
      return req;
    };
    await make(1, 'AWAITING_PROVIDER_RESPONSE');
    await make(2, 'PROVIDER_RESPONDED', {});
    await make(3, 'PROVIDER_RESPONDED', { objection: 'No legal basis.' });
    const decided = await make(4, 'REJECTED', { objection: 'No retention.' });
    await db.decision.create({
      data: {
        requestId: decided.id,
        outcome: 'REJECTED',
        justification: 'Rejected in Sprint 2 for missing retention.',
        decidedById: officer.id,
      },
    });
    const before = await snapshot(db);
    expect(before).toHaveLength(4);

    await deploy(sprint3);

    await expect(snapshot(db)).resolves.toEqual(before);
    await expect(db.pipelineRun.count()).resolves.toBe(0);
  });
});

describe('Seeding twice (e2e)', () => {
  const prisma = new PrismaClient();
  const model = new StandInModelClient();
  let app: INestApplicationContext;
  let counterExisted: boolean;
  const year = new Date().getUTCFullYear();

  const counts = async () => ({
    entities: await prisma.entity.count(),
    users: await prisma.user.count(),
    requests: await prisma.dataSharingRequest.count(),
    documents: await prisma.document.count(),
    responses: await prisma.providerResponse.count(),
    flagReasons: await prisma.flagReason.count(),
    decisions: await prisma.decision.count(),
    runs: await prisma.pipelineRun.count(),
  });

  beforeAll(async () => {
    counterExisted =
      (await prisma.referenceCounter.findUnique({ where: { year } })) !== null;
    // As seed.ts does: the whole app, as a context.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue(new MockMailTransport())
      .overrideProvider(MODEL_CLIENT)
      .useValue(model)
      .compile();
    app = await moduleRef.init();
  });

  afterAll(async () => {
    const slugs = (
      JSON.parse(
        await readFile(
          join(API_DIR, 'prisma', 'seed', 'entities.json'),
          'utf-8',
        ),
      ) as { slug: string }[]
    ).map((e) => e.slug);
    const seeded = await prisma.entity.findMany({
      where: { slug: { in: slugs } },
    });
    await removeEntities(prisma, seeded);
    if (!counterExisted) {
      await prisma.referenceCounter.deleteMany({ where: { year } });
    }
    await app?.close();
    await prisma.$disconnect();
  });

  it('duplicates nothing, starts no run and makes no model call', async () => {
    const run = () =>
      seedDemoData(
        app.get(PrismaService),
        app.get<StorageService>(STORAGE_SERVICE),
      );
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await run();
    const first = await counts();
    const statuses = await snapshot(prisma);
    await run();
    log.mockRestore();

    expect(first.requests).toBeGreaterThan(0);
    await expect(counts()).resolves.toEqual(first);
    await expect(snapshot(prisma)).resolves.toEqual(statuses);
    expect(first.runs).toBe(0);
    // Seeded responses keep their Sprint 2 status (spec §2.16).
    expect(statuses.map((r) => r.status)).not.toContain(
      'UNDER_AUTOMATED_REVIEW',
    );
    expect(model.calls).toHaveLength(0);
  });
});

describe('Starting the app (e2e)', () => {
  const prisma = new PrismaClient();

  afterAll(() => prisma.$disconnect());

  it('makes no model call, and ends interrupted runs flagged without running them', async () => {
    const fixtures = await createEntityFixtures(prisma, 2);
    const [a, b] = fixtures.entities;
    const stepRan = vi.fn();
    const steps: PipelineStep[] = [
      {
        name: 'extract',
        async run(ctx) {
          stepRan();
          await ctx.callModel({ content: [{ type: 'text', text: 'Hello' }] });
          return { result: null };
        },
      },
    ];
    // Runs left behind by a stopped instance: one mid-step, one never
    // picked up.
    const interrupted: string[] = [];
    for (const state of ['RUNNING', 'QUEUED'] as const) {
      const { request: req } = await createTestRequest(prisma, {
        from: a,
        to: b,
        title: `Interrupted ${state}`,
      });
      await prisma.dataSharingRequest.update({
        where: { id: req.id },
        data: { status: 'UNDER_AUTOMATED_REVIEW' },
      });
      const run = await prisma.pipelineRun.create({
        data: {
          requestId: req.id,
          trigger: 'RESPONSE',
          state,
          models: [{ step: 'extract', model: 'claude-haiku-5-5' }],
          ruleSetVersion: RULE_SET_VERSION,
          leaseUntil: state === 'RUNNING' ? new Date(Date.now() - 1000) : null,
        },
      });
      await prisma.$executeRaw`UPDATE "PipelineRun" SET "updatedAt" = now() - interval '10 minutes' WHERE id = ${run.id}`;
      interrupted.push(req.id);
    }

    const model = new StandInModelClient().script('extract', {
      model: 'stand-in',
      text: 'answer',
    });
    const { app } = await createTestApp({ steps, model });
    try {
      // The sweep the app started on boot.
      await app.get(PipelineSweeper).sweep();

      for (const requestId of interrupted) {
        const run = await prisma.pipelineRun.findFirstOrThrow({
          where: { requestId },
        });
        expect(run.state).toBe('FAILED');
        const reasons = await prisma.flagReason.findMany({
          where: { requestId },
        });
        expect(reasons.map((r) => r.source)).toEqual(['PIPELINE']);
      }
      expect(stepRan).not.toHaveBeenCalled();
      expect(model.calls).toHaveLength(0);
    } finally {
      await fixtures.cleanup();
      await app.close();
    }
  });
});
