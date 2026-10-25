import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  parsePlatformAdminRevocationArgs,
  revokePlatformAdminAssignment,
} from '../src/database/platform-admin-revocation.js';

const target = parsePlatformAdminRevocationArgs(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL must be set to revoke a platform administrator.',
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function revokePlatformAdmin(): Promise<void> {
  const revoked = await prisma.$transaction((transaction) =>
    revokePlatformAdminAssignment(transaction, target),
  );

  if (revoked) {
    console.log(
      `Revoked platform_admin from "${target.email}" for client "${target.clientId}".`,
    );
  } else {
    console.log(
      `No platform_admin assignment exists for "${target.email}" in client "${target.clientId}".`,
    );
  }
}

revokePlatformAdmin()
  .catch((error: unknown) => {
    console.error(
      'Failed to revoke platform_admin.',
      error instanceof Error ? error.message : 'Unexpected error.',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
