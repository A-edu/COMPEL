import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function setup() {
  const testUrl = process.env.TEST_DATABASE_URL;
  const devUrl = process.env.DATABASE_URL;

  if (!testUrl) {
    throw new Error(
      'TEST_DATABASE_URL must be set to run e2e tests (a separate schema on the development database).',
    );
  }
  if (testUrl === devUrl) {
    throw new Error(
      'TEST_DATABASE_URL must not equal DATABASE_URL — e2e tests must never touch the development/production database.',
    );
  }

  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });

  process.env.DATABASE_URL = testUrl;

  // e2e tests must never touch Replit App Storage (AGENTS.md -> Testing).
  process.env.STORAGE_DRIVER = 'local';

  // ...nor the real model (Sprint 3 spec §4.3, §5.6): no key, and pipeline
  // steps run in-process rather than through the app's public URL. A test
  // that needs the internal token sets its own.
  for (const name of [
    'ANTHROPIC_API_KEY',
    'PIPELINE_SELF_URL',
    'PIPELINE_INTERNAL_TOKEN',
    'PIPELINE_PROBE_SECONDS',
  ]) {
    delete process.env[name];
  }
  process.env.UPLOAD_DIR = join(tmpdir(), 'compel-e2e-uploads');
}
