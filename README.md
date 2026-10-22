# Baloot Auth

Reusable authentication and basic authorization for applications. Baloot Auth
is built with NestJS, TypeScript, PostgreSQL, and Prisma ORM 8.

The service provides client-scoped registration and email verification,
password reset, HttpOnly cookie authentication, rotating refresh tokens,
revocable sessions, role-based authorization, and same-client platform
administrator operations.

## Documentation

Start with the [documentation index](./docs/index.md). Guides cover local
setup, the authentication API, security, database and migrations, testing,
and operator procedures.

## Quick Start

Requirements: Node.js, pnpm, PostgreSQL, and environment-specific email
configuration. Prisma ORM 8 is currently an installed release candidate.

```bash
pnpm install
```

Copy `.env.example` to an untracked `.env` and configure the local database,
secrets, email provider, allowed origins, and seed clients. The database schema
must be provisioned through the reviewed migration process for your
environment before seeding or starting the service.

```bash
pnpm db:seed
pnpm start:dev
```

The API defaults to `http://localhost:3000`; interactive Swagger documentation
is available at `http://localhost:3000/api/docs`.

## Common Commands

```bash
pnpm test -- --runInBand
pnpm build
pnpm exec eslint "src/**/*.ts" "test/**/*.ts"
```

See [Testing](./docs/testing.md) for focused test commands and the manual
smoke-test checklist. See [Database and migrations](./docs/database.md) before
making contract or database changes.

## Project Principles

- Security-first, client-scoped authentication.
- Small, reviewable changes with appropriate tests.
- Reviewed database migrations and environment-appropriate change control.
- Clear API and operator documentation.
