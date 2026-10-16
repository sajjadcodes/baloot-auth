import { isEmail } from 'class-validator';
import { CLIENT_ID_PATTERN } from '../auth/auth.constants.js';

export interface PlatformAdminRevocationTarget {
  clientId: string;
  email: string;
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
