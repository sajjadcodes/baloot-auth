import { isEmail } from 'class-validator';
import { CLIENT_ID_PATTERN } from '../auth/auth.constants.js';

export interface SeedClient {
  id: string;
  name: string;
  origins: string[];
}

export interface SeedPlatformAdmin {
  clientId: string;
  email: string;
}

export function parsePlatformAdminSeedConfig(
  adminsJson: string | undefined,
  clients: SeedClient[],
): SeedPlatformAdmin[] {
  if (adminsJson === undefined || adminsJson.trim() === '') {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(adminsJson);
  } catch {
    throw new Error('SEED_PLATFORM_ADMIN_USERS_JSON must contain valid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('SEED_PLATFORM_ADMIN_USERS_JSON must be a JSON array.');
  }

  const clientIds = new Set(clients.map((client) => client.id));
  const seenAssignments = new Set<string>();

  return parsed.map((value: unknown, index: number): SeedPlatformAdmin => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(
        `SEED_PLATFORM_ADMIN_USERS_JSON item ${index + 1} must be an object.`,
      );
    }

    const admin = value as Record<string, unknown>;
    const clientId =
      typeof admin.clientId === 'string' ? admin.clientId.trim() : '';
    const email =
      typeof admin.email === 'string' ? admin.email.trim().toLowerCase() : '';

    if (!CLIENT_ID_PATTERN.test(clientId) || !clientIds.has(clientId)) {
      throw new Error(
        `SEED_PLATFORM_ADMIN_USERS_JSON item ${index + 1} must reference a client in SEED_CLIENTS_JSON.`,
      );
    }
    if (email.length > 320 || !isEmail(email)) {
      throw new Error(
        `SEED_PLATFORM_ADMIN_USERS_JSON item ${index + 1} must have a valid email.`,
      );
    }

    const assignment = `${clientId}:${email}`;
    if (seenAssignments.has(assignment)) {
      throw new Error(
        `SEED_PLATFORM_ADMIN_USERS_JSON contains duplicate assignment for "${email}".`,
      );
    }
    seenAssignments.add(assignment);

    return { clientId, email };
  });
}

// Validate deployment-provided client data before the seed script writes it.
export function parseClientSeedConfig(
  clientsJson: string | undefined,
  corsOriginsValue: string | undefined,
): SeedClient[] {
  // Require an explicit seed configuration instead of silently skipping clients.
  if (!clientsJson?.trim()) {
    throw new Error('SEED_CLIENTS_JSON must contain a JSON array of clients.');
  }

  // Treat environment input as untrusted and report malformed JSON clearly.
  let parsed: unknown;
  try {
    parsed = JSON.parse(clientsJson);
  } catch {
    throw new Error('SEED_CLIENTS_JSON must contain valid JSON.');
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('SEED_CLIENTS_JSON must contain at least one client.');
  }

  // Every client origin must also pass the global CORS allowlist.
  const corsOrigins = new Set(
    (corsOriginsValue ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  const seenClientIds = new Set<string>();

  // Validate and normalize each client independently before returning seed data.
  return parsed.map((value: unknown, index: number): SeedClient => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`SEED_CLIENTS_JSON item ${index + 1} must be an object.`);
    }

    const client = value as Record<string, unknown>;
    const id = typeof client.id === 'string' ? client.id.trim() : '';
    const name = typeof client.name === 'string' ? client.name.trim() : '';

    // IDs must remain stable and unique because frontends use them to identify the client.
    if (!CLIENT_ID_PATTERN.test(id)) {
      throw new Error(
        `SEED_CLIENTS_JSON item ${index + 1} must have a valid UUID id.`,
      );
    }
    if (seenClientIds.has(id)) {
      throw new Error(
        `SEED_CLIENTS_JSON contains duplicate client id "${id}".`,
      );
    }
    seenClientIds.add(id);

    if (name.length === 0 || name.length > 128) {
      throw new Error(
        `SEED_CLIENTS_JSON item ${index + 1} name must be 1–128 characters.`,
      );
    }
    if (
      !Array.isArray(client.origins) ||
      client.origins.length === 0 ||
      !client.origins.every((origin) => typeof origin === 'string')
    ) {
      throw new Error(
        `SEED_CLIENTS_JSON item ${index + 1} must have a non-empty origins array.`,
      );
    }

    // Reject duplicates rather than hiding mistakes in deployment configuration.
    const origins = client.origins.map((origin: string) => origin.trim());
    if (new Set(origins).size !== origins.length) {
      throw new Error(
        `SEED_CLIENTS_JSON item ${index + 1} contains duplicate origins.`,
      );
    }

    // Origins must be exact HTTP(S) origins and present in the global CORS setting.
    for (const origin of origins) {
      let parsedOrigin: URL;
      try {
        parsedOrigin = new URL(origin);
      } catch {
        throw new Error(
          `SEED_CLIENTS_JSON item ${index + 1} contains an invalid origin.`,
        );
      }

      if (
        !['http:', 'https:'].includes(parsedOrigin.protocol) ||
        parsedOrigin.origin !== origin ||
        origin.length > 512
      ) {
        throw new Error(
          `SEED_CLIENTS_JSON item ${index + 1} origins must be exact HTTP(S) origins no longer than 512 characters.`,
        );
      }
      if (!corsOrigins.has(origin)) {
        throw new Error(
          `Origin "${origin}" must also be present in CORS_ORIGINS.`,
        );
      }
    }

    return { id, name, origins };
  });
}
