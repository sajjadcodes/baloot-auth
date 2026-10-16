export const ACCESS_TOKEN_COOKIE = 'baloot_access';
export const REFRESH_TOKEN_COOKIE = 'baloot_refresh';
export const BEARER_TOKEN_PATTERN = /^Bearer\s+(\S+)$/i;
export const CLIENT_ID_HEADER = 'x-client-id';
export const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const AUTH_THROTTLE_WINDOW_MS = 60_000;
export const AUTH_GLOBAL_RATE_LIMIT = 10;
export const REGISTER_RATE_LIMIT = 5;
export const LOGIN_RATE_LIMIT = 5;
export const REFRESH_RATE_LIMIT = 5;
export const REFRESH_TOKEN_BYTES = 32;
export const REFRESH_TOKEN_HASH_ALGORITHM = 'sha256';
export const REFRESH_TOKEN_HASH_MAX_LENGTH = 128;
export const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const ARGON2_MEMORY_COST_KIB = 19 * 1024;
export const ARGON2_TIME_COST = 2;
export const ARGON2_PARALLELISM = 1;

export const ACCESS_TOKEN_ALGORITHM = 'HS256';
