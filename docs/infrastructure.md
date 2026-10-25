# Infrastructure and Deployment

## Target architecture

The planned deployment separates the application from its database:

- **Application:** Baloot Auth, a NestJS backend deployed on blitz.cloud.
- **Database:** Managed PostgreSQL hosted by Supabase.
- **Source and deployment workflow:** GitHub.
- **Frontend:** Not part of this repository or service.
- **Local development:** Continue to use a local PostgreSQL database and
  environment-specific configuration.

blitz.cloud is the application host, not the database provider. Supabase is
the intended PostgreSQL provider.

This describes the selected architecture, not a completed deployment.
Provider-specific settings, Free-tier behavior, and supported connection
methods must be checked against current official blitz.cloud, Supabase, and
Prisma documentation before configuring a deployment.

## Application configuration

The application reads and validates its configuration from environment
variables. See [Getting started](./getting-started.md) and
[`.env.example`](../.env.example) for the complete list of required and
optional variables.

The current application expects:

- `PORT` for the HTTP listener.
- `DATABASE_URL` for its PostgreSQL runtime connection.
- Exact frontend origins in `CORS_ORIGINS` and the corresponding client
  origin seed configuration.
- Distinct, private access-token, email-verification, and password-reset
  signing secrets.
- Resend email credentials and sender configuration.
- HTTPS verification and password-reset URLs in production.

Keep secrets in the host's protected environment configuration, not in Git or
build artifacts. Do not put production credentials in a developer workstation
`.env` file.

The application uses Prisma ORM 7 with the PostgreSQL driver adapter and reads
`DATABASE_URL` for its runtime connection. Prisma CLI commands use that
variable through `prisma.config.ts` when running migrations. The build only
generates Prisma Client and does not need database credentials. Whether
Supabase's pooled or direct
connection should be used for each operation depends on the connection mode
supported by the hosting environment; verify that before setting the
production value.

## Build and process

The repository's current commands are:

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run start:prod
```

The production entry point is `dist/src/main.js`. The NestJS bootstrap reads
`PORT` through validated application configuration and enables shutdown
hooks. The current production binding is `127.0.0.1`, inherited from a
reverse-proxy deployment. Confirm blitz.cloud's ingress and listening-host
requirements before changing it; if public platform ingress must connect
directly to the process, the current loopback-only binding may need a reviewed
adjustment. Preserve the existing local development behavior.

No Dockerfile or GitHub Actions deployment workflow is currently provided.
Use only deployment commands, health checks, and environment settings
supported by the host's current documentation. Do not infer them from another
provider's conventions.

## Database and migration rollout

The project uses a Prisma ORM 7 schema and committed SQL migrations. Review
[Database and migrations](./database.md) before changing the schema.

Before connecting a Supabase project:

1. Confirm the Supabase project and database are the intended target.
2. Choose a connection mode supported by both Supabase and the Prisma runtime
   version in this repository.
3. Store the connection string as a protected `DATABASE_URL` without printing
   or committing it.
4. Inspect the database and migration history before applying anything.
5. Back up any data that must be retained and test the migration against a
   suitable non-production database first.
6. Apply only reviewed migrations with `pnpm db:migrate:deploy`.

Do not reset or recreate a database containing data. The committed initial
migration creates the complete schema from the Prisma 7 model. The current
Supabase database is a fresh test database; do not assume another target is
empty or treat this baseline as a migration for an existing populated schema.

## Deployment checklist

- [ ] Confirm current blitz.cloud build, start, port, health-check, Node.js,
      package-manager, and Free-tier requirements using official documentation.
- [ ] Confirm current Supabase PostgreSQL connection and pooling guidance for
      the Prisma runtime version used by this project.
- [ ] Configure GitHub deployment from the intended branch and repository.
- [ ] Add required environment values through protected host configuration.
- [ ] Confirm production CORS origins, client origins, email sender, and HTTPS
      verification/reset URLs.
- [ ] Review and apply required database migrations safely.
- [ ] Build and deploy, then verify service startup and the public API health
      response.
- [ ] Exercise registration, email verification, login, refresh, logout, and
      password-reset flows with synthetic accounts.
- [ ] Review Free-tier limits and service behavior, including any sleeping,
      connection, storage, or resource constraints, against the providers'
      current documentation.

Do not claim deployment is complete until the deployed API and required
authentication flows have been verified.

## Troubleshooting boundaries

For startup failures, inspect the host's application logs and confirm the
build/start commands and required environment variables. Never print secrets
or share unredacted logs.

For database failures, verify that the configured URL targets the intended
Supabase project and that the selected connection mode is supported by
Supabase, the host, and the installed Prisma runtime. Do not disable TLS or
switch to a weaker connection mode as a workaround.
