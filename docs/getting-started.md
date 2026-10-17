# Getting Started

Baloot Auth is a reusable authentication and basic authorization service built
with NestJS, TypeScript, PostgreSQL, and Prisma ORM 8.

## Prerequisites

- Node.js compatible with the installed project dependencies.
- pnpm.
- PostgreSQL.
- Access to the environment's approved database and email-delivery
  configuration.

Prisma ORM 8 is currently installed as a release candidate.

## Install and configure

Install dependencies:

```bash
pnpm install
```

Copy `.env.example` to an untracked `.env`. Set `DATABASE_URL` to the intended
database and provide a cryptographically random `JWT_ACCESS_SECRET` of at
least 32 characters. Never commit secrets or use production credentials in a
local development environment.

Important configuration:

| Variable                         | Purpose                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `NODE_ENV`                       | Runtime environment.                                                                            |
| `PORT`                           | HTTP port; defaults to `3000`.                                                                  |
| `DATABASE_URL`                   | PostgreSQL connection string.                                                                   |
| `CORS_ORIGINS`                   | Comma-separated exact HTTP(S) origins. Wildcards, paths, and trailing slashes are not accepted. |
| `SEED_CLIENTS_JSON`              | Optional JSON array of client UUIDs, names, and allowed origins for `pnpm db:seed`.             |
| `JWT_ACCESS_SECRET`              | Private access-token signing secret, at least 32 characters.                                    |
| `JWT_ACCESS_TTL_SECONDS`         | Access-token lifetime, between 60 and 3600 seconds; default 900.                                |
| `REFRESH_SESSION_TTL_SECONDS`    | Refresh-session lifetime, between 3600 and 7776000 seconds; default 2592000.                    |
| `AUTH_COOKIE_SAME_SITE`          | `lax`, `strict`, or `none`; `none` is allowed only in production with Secure cookies.           |
| `EMAIL_VERIFICATION_SECRET`      | Private verification-token secret, distinct from other JWT secrets.                             |
| `EMAIL_VERIFICATION_TTL_SECONDS` | Verification-token lifetime.                                                                    |
| `EMAIL_VERIFICATION_URL`         | Frontend verification page; HTTPS is required in production.                                    |
| `PASSWORD_RESET_SECRET`          | Private reset-token secret, distinct from other JWT secrets.                                    |
| `PASSWORD_RESET_TTL_SECONDS`     | Reset-token lifetime, between 300 and 86400 seconds; default 900.                               |
| `PASSWORD_RESET_URL`             | Frontend reset page; HTTPS is required in production.                                           |
| `RESEND_API_KEY`                 | Resend API credential.                                                                          |
| `AUTH_EMAIL_FROM`                | Sender address verified with Resend.                                                            |

Use one stable UUID per client. Client IDs are public identifiers, not secrets.
The backend's global `CORS_ORIGINS` values and each client's database origin
allowlist must both include an origin for browser requests to work.

Example local-only configuration:

```dotenv
CORS_ORIGINS=http://localhost:5173
SEED_CLIENTS_JSON=[{"id":"00000000-0000-4000-8000-000000000001","name":"Local app","origins":["http://localhost:5173"]}]
```

Keep deployment-specific values in the environment's protected configuration,
not in Git. See [Security](./security.md) and
[Platform administrator operations](./platform-admin-operations.md).

## Initialize local application data

The database schema must already be provisioned by the maintainer-approved
migration process. The seed command provisions configured client/origin rows
and built-in roles; it does not create the database schema.

```bash
pnpm db:seed
pnpm start:dev
```

The server validates runtime configuration and connects to PostgreSQL before
it starts listening. The default local API is available at
`http://localhost:3000`; Swagger is at `http://localhost:3000/api/docs`.

For database contract and migration procedures, see
[Database and migrations](./database.md).
