import { isEmail } from 'class-validator';
import { CLIENT_ID_PATTERN } from '../auth/auth.constants.js';
import { toVarchar } from '../prisma/varchar.js';
import type { PrismaService } from './prisma.service.js';

export interface PlatformAdminRevocationTarget {
  clientId: string;
  email: string;
}

export type PlatformAdminRevocationTransaction = Parameters<
  Parameters<PrismaService['client']['transaction']>[0]
>[0];

export async function revokePlatformAdminAssignment(
  transaction: PlatformAdminRevocationTransaction,
  target: PlatformAdminRevocationTarget,
): Promise<boolean> {
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

  const assignmentFilter = { userId: user.id, roleId: role.id };
  const assignment =
    await transaction.orm.public.UserRole.where(assignmentFilter).first();

  if (!assignment) {
    return false;
  }

  await transaction.orm.public.UserRole.where(assignmentFilter).delete();
  return true;
}

export function parsePlatformAdminRevocationArgs(
  args: string[],
): PlatformAdminRevocationTarget {
  const options = new Map<string, string>();
  let confirmed = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--confirm') {
      if (confirmed) {
        throw new Error('The --confirm option must not be repeated.');
      }
      confirmed = true;
      continue;
    }

    if (argument !== '--client-id' && argument !== '--email') {
      throw new Error(
        'Usage: pnpm db:role:revoke -- --client-id <uuid> --email <email> --confirm',
      );
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`The ${argument} option requires a value.`);
    }
    if (options.has(argument)) {
      throw new Error(`The ${argument} option must not be repeated.`);
    }

    options.set(argument, value.trim());
    index += 1;
  }

  const clientId = options.get('--client-id');
  const email = options.get('--email')?.toLowerCase();

  if (!clientId || !email) {
    throw new Error(
      'Usage: pnpm db:role:revoke -- --client-id <uuid> --email <email> --confirm',
    );
  }

  if (!CLIENT_ID_PATTERN.test(clientId)) {
    throw new Error('--client-id must be a valid UUID.');
  }
  if (email.length > 320 || !isEmail(email)) {
    throw new Error('--email must be a valid email address.');
  }
  if (!confirmed) {
    throw new Error(
      'Role revocation requires explicit confirmation with --confirm.',
    );
  }

  return { clientId, email };
}
