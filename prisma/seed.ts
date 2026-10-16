import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { parseClientSeedConfig } from '../src/database/client-seed-config';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set to seed application clients.');
}

// Keep client IDs and production origins in deployment environment, not source control.
const clients = parseClientSeedConfig(
  process.env.SEED_CLIENTS_JSON,
  process.env.CORS_ORIGINS,
);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function seed(): Promise<void> {
  for (const client of clients) {
    await prisma.client.upsert({
      where: { id: client.id },
      update: { name: client.name },
      create: {
        id: client.id,
        name: client.name,
      },
    });

    for (const origin of client.origins) {
      await prisma.clientAllowedOrigin.upsert({
        where: {
          clientId_origin: {
            clientId: client.id,
            origin,
          },
        },
        update: {},
        create: {
          clientId: client.id,
          origin,
        },
      });
    }
  }
}

seed()
  .catch((error: unknown) => {
    console.error('Failed to seed application clients.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
