# Database and Migrations

Baloot Auth uses PostgreSQL and Prisma ORM 8's PostgreSQL contract and runtime.
It does not use Prisma 7's generated `PrismaClient` or driver adapter.
Supabase is the planned managed PostgreSQL provider. Confirm its current
connection guidance against the Prisma runtime version used by this project
before choosing a connection string or pooler mode. The application and
migration tooling currently read `DATABASE_URL`; a separate direct migration
URL is not configured.

## Contract

The source data contract is [contract.prisma](../src/prisma/contract.prisma).
The emitted `contract.json` and `contract.d.ts` artifacts are used by the
runtime. After an approved contract change, emit updated artifacts with:

```bash
pnpm contract:emit
```

Review the emitted diff and commit it together with the source contract and
the reviewed migration artifacts.

## Migration control

Treat database migrations as reviewed, data-changing operations. Follow the
approval and release process for the target environment; do not bypass it
with another tool or script. Never reset or apply an unreviewed migration to
a database containing data.

The normal workflow is:

1. Update the contract and explain the schema impact.
2. Propose a Prisma ORM 8 migration planning command and describe its effect.
3. Obtain approval from the authorized maintainers before creating or
   executing the migration.
4. Review the migration operations and any data transformation.
5. Test against an appropriate non-production database before deployment.
6. Apply through the environment's approved release process.

For the planned Supabase deployment, first inspect the target project's
existing schema and migration history. Select a connection method supported
by both Supabase and the installed Prisma runtime, and verify the complete
migration process in a non-production database. Never use a production reset
or assume the target contains no data.

For account/session administration, see
[the rollout notes](./account-session-administration.md). In particular, the
migration requires `refresh_sessions` to be empty when adding its required
`session_id` column.
