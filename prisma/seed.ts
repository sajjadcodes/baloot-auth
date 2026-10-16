import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import { parseClientSeedConfig } from '../src/database/client-seed-config.js';
import type { Contract } from '../src/prisma/contract.d.js';
import contractJson from '../src/prisma/contract.json' with { type: 'json' };
import { toVarchar } from '../src/prisma/varchar.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set to seed application clients.');
}

// Keep client IDs and production origins in deployment environment, not source control.
const clients = parseClientSeedConfig(
  process.env.SEED_CLIENTS_JSON,
  process.env.CORS_ORIGINS,
);
const prisma = postgres<Contract>({
  contractJson,
  url: databaseUrl,
});

async function seed(): Promise<void> {
  const models = prisma.orm.public;

  for (const client of clients) {
    const existingClient = await models.Client.where({ id: client.id }).first();
    if (existingClient) {
      await models.Client.where({ id: client.id }).update({
        name: toVarchar(client.name, 128),
      });
    } else {
      await models.Client.create({
        id: client.id,
        name: toVarchar(client.name, 128),
      });
    }

    for (const origin of client.origins) {
      const existingOrigin = await models.ClientAllowedOrigin.where({
        clientId: client.id,
        origin: toVarchar(origin, 512),
      }).first();
      if (!existingOrigin) {
        await models.ClientAllowedOrigin.create({
          clientId: client.id,
          origin: toVarchar(origin, 512),
        });
      }
    }
  }

  const userRole = await models.Role.where({
    name: toVarchar('user', 64),
  }).first();
  if (!userRole) {
    await models.Role.create({ name: toVarchar('user', 64) });
  }
}

seed()
  .catch((error: unknown) => {
    console.error('Failed to seed application clients.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.close();
  });
