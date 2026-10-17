# Database and Migrations

Baloot Auth uses PostgreSQL and Prisma ORM 8's PostgreSQL contract and runtime.
It does not use Prisma 7's generated `PrismaClient` or driver adapter.

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

Database migrations are controlled by the project maintainer. Do not create,
plan, apply, run, reset, or deploy a migration without explicit maintainer
approval. Do not bypass this requirement with another tool or script.

The normal workflow is:

1. Update the contract and explain the schema impact.
2. Propose a Prisma ORM 8 migration planning command and describe its effect.
3. Wait for explicit approval before creating or executing the migration.
4. Review the migration operations and any data transformation.
5. Test against an appropriate non-production database before deployment.
6. Apply through the maintainer-approved process.

For account/session administration, see
[the rollout notes](./account-session-administration.md). In particular, the
migration requires `refresh_sessions` to be empty when adding its required
`session_id` column.
