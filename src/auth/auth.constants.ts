export const ACCESS_TOKEN_COOKIE = 'baloot_access';
export const REFRESH_TOKEN_COOKIE = 'baloot_refresh';
export const BEARER_TOKEN_PATTERN = /^Bearer\s+(\S+)$/i;

export const AUTH_THROTTLE_WINDOW_MS = 60_000;
export const AUTH_GLOBAL_RATE_LIMIT = 10;
export const REGISTER_RATE_LIMIT = 5;

export const ARGON2_MEMORY_COST_KIB = 19 * 1024;
export const ARGON2_TIME_COST = 2;
export const ARGON2_PARALLELISM = 1;

export const ACCESS_TOKEN_ALGORITHM = 'HS256';
