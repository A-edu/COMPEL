import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.interface.js';
import { seedDemoData } from './seed-data.js';

async function run(): Promise<void> {
  if (process.env.DEMO_MODE !== 'true') {
    console.error('Refusing to seed: DEMO_MODE is not "true".');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    await seedDemoData(
      app.get(PrismaService),
      app.get<StorageService>(STORAGE_SERVICE),
    );
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
