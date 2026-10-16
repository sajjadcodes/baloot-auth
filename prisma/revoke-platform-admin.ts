import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import { parsePlatformAdminRevocationArgs } from '../src/database/platform-admin-revocation.js';
import type { Contract } from '../src/prisma/contract.d.js';
import contractJson from '../src/prisma/contract.json' with { type: 'json' };
import { toVarchar } from '../src/prisma/varchar.js';

const target = parsePlatformAdminRevocationArgs(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL must be set to revoke a platform administrator.',
  );
}

const prisma = postgres<Contract>({
  contractJson,
  url: databaseUrl,
});

async function revokePlatformAdmin(): Promise<void> {
  const revoked = await prisma.transaction(async (transaction) => {
    const user = await transaction.orm.public.User.where({
      clientId: target.clientId,
      email: toVarchar(target.email, 320),
    }).first();

    if (!user) {
      throw new Error(
        `No account "${target.email}" was found for client "${target.clientId}".`,
      );
    }

    const role = await transaction.orm.public.Role.where({
      name: toVarchar('platform_admin', 64),
    }).first();

    if (!role) {
      return false;
    }

    const assignment = await transaction.orm.public.UserRole.where({
      userId: user.id,
      roleId: role.id,
    }).first();

    if (!assignment) {
      return false;
    }

    await transaction.orm.public.UserRole.where({
      userId: user.id,
      roleId: role.id,
    }).delete();

    return true;
  });

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
    await prisma.close();
  });
