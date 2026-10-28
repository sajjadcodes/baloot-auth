# Database and migrations

The application uses stable Prisma ORM 7 with the PostgreSQL driver adapter.
The canonical schema is [`prisma/schema.prisma`](../prisma/schema.prisma), and
the Prisma CLI configuration is [`prisma.config.ts`](../prisma.config.ts).
The runtime and database migration commands read `DATABASE_URL`. Client
generation does not require a database connection.

## Local development

Install dependencies and set `DATABASE_URL` in an untracked `.env` file.
Apply the committed migration, generate the Prisma Client, and seed the local
database:

```bash
pnpm db:migrate:dev
pnpm db:generate
pnpm db:seed
```

The `build` command also runs `prisma generate` before compiling the NestJS
application. A production `DATABASE_URL` is therefore not required during
image building; provide it in the running service's protected environment.

## Changing the schema

1. Update `prisma/schema.prisma`.
2. Create and apply a development migration with `pnpm db:migrate:dev`.
   Give the migration a descriptive name when prompted.
3. Review the generated SQL under `prisma/migrations/`, then test the
   application and migration against a non-production database.
4. Commit the schema and its migration together.

Do not edit an already-applied migration to change a database. Add a new
migration instead. `pnpm db:generate` refreshes the client after schema
changes; it does not alter the database.

## Deployment

Use `pnpm db:migrate:deploy` to apply committed migrations in a deployment
environment. Run it as a deployment/release step before starting application
instances that require the changed schema. Review the target database and
migration history first; do not use `migrate dev` in deployment.

The committed `20261025_init` migration creates the schema represented by the
current Prisma 7 model. It is intended for a fresh database. Do not apply it
to a populated database or use it to recreate a schema whose previous
migration history was removed. Existing environments need a reviewed
baseline/adoption plan that matches their actual schema before using this
migration history.

The Neon database is the managed PostgreSQL provider for deployment. Do not
apply migrations automatically; run the deployment command only after
confirming the configured `DATABASE_URL` points to the intended environment.

## Commands

| Command                  | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| `pnpm db:generate`       | Generate Prisma Client from the Prisma 7 schema.      |
| `pnpm db:migrate:dev`    | Create/apply migrations in local development.         |
| `pnpm db:migrate:deploy` | Apply committed migrations without creating new ones. |
| `pnpm db:seed`           | Seed configured clients/origins and built-in roles.   |

Never commit database credentials or use production credentials for local
development.
