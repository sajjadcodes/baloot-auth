import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  parseClientSeedConfig,
  parsePlatformAdminSeedConfig,
} from '../src/database/client-seed-config.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set to seed application clients.');
}

const clients = parseClientSeedConfig(
  process.env.SEED_CLIENTS_JSON,
  process.env.CORS_ORIGINS,
);
const platformAdmins = parsePlatformAdminSeedConfig(
  process.env.SEED_PLATFORM_ADMIN_USERS_JSON,
  clients,
);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function seed(): Promise<void> {
  for (const client of clients) {
    await prisma.client.upsert({
      where: { id: client.id },
      update: { name: client.name },
      create: { id: client.id, name: client.name },
    });

    for (const origin of client.origins) {
      await prisma.clientAllowedOrigin.upsert({
        where: {
          clientId_origin: { clientId: client.id, origin },
        },
        update: {},
        create: { clientId: client.id, origin },
      });
    }
  }

  for (const name of ['user', 'platform_admin']) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const admin of platformAdmins) {
    await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: { clientId: admin.clientId, email: admin.email },
        select: { id: true, status: true, emailVerifiedAt: true },
      });

      if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
        throw new Error(
          `Cannot grant platform_admin: active, verified user "${admin.email}" was not found for client "${admin.clientId}".`,
        );
      }

      const role = await transaction.role.findUnique({
        where: { name: 'platform_admin' },
        select: { id: true },
      });

      if (!role) {
        throw new Error('The platform_admin role could not be provisioned.');
      }

      await transaction.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    });
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
