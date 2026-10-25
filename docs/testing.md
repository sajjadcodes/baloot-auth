# Testing

Unit tests use Jest and are colocated with the implementation as
`*.spec.ts`. The suite uses mocks for external services and database access;
running unit tests does not require a PostgreSQL database. There is currently
no end-to-end test suite or `test/jest-e2e.json` configuration.

Run the complete unit suite from the repository root:

```bash
pnpm test -- --runInBand
```

Run a focused suite by passing a path relative to `src/`:

```bash
pnpm test -- --runInBand auth/auth.service.spec.ts
pnpm test -- --runInBand auth/strategies/jwt.strategy.spec.ts auth/auth.controller.spec.ts
```

Collect test coverage when investigating coverage gaps:

```bash
pnpm test:cov -- --runInBand
```

## Build and static checks

Run the application build:

```bash
pnpm build
```

Run ESLint without modifying files:

```bash
pnpm exec eslint "src/**/*.ts" "test/**/*.ts"
```

The package `pnpm lint` script runs ESLint with `--fix`, which can modify
files; review its diff before keeping any changes. Check formatting on the
files you changed:

```bash
pnpm exec prettier --check README.md docs
git diff --check
```

## Manual smoke test after migration

After the required database migration has been applied and client seed data
is configured, start the service and use Swagger at
`http://localhost:3000/api/docs` or an approved test client. Never use
production credentials or real user accounts for local testing.

1. Register a test account with an active client and allowed origin.
2. Verify the email, then log in; confirm the response sets HttpOnly cookies
   without returning token values in the response body.
3. Call `GET /auth/me`, refresh the session, and call `/auth/me` again.
4. Log out; confirm the cookies are cleared and the former access token is
   rejected immediately.
5. As a same-client `platform_admin`, inspect a test user and list that user's
   active sessions. Verify the response contains session IDs and timestamps
   only, never refresh-token material.
6. Revoke one listed session and confirm its access token and refresh token
   no longer work.
7. Disable a test user and confirm all of that user's sessions are invalid;
   then re-enable the account and confirm it must log in to create a new
   session.
8. Confirm admins cannot disable themselves and cannot administer another
   client's user.
9. Check that successful admin mutations produce `admin_audit_events`
   records. Verify a failed transaction rolls back both the operation and its
   audit write.

The schema migration currently requires `refresh_sessions` to be empty at
migration time. See [Database and migrations](./database.md) before testing a
fresh or upgraded environment.

For a hosted deployment, repeat the applicable API smoke tests against the
deployed HTTPS endpoint using synthetic accounts and an approved test client.
Do not run data-changing test cases against real user accounts.
