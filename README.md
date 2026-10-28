# Baloot Auth

Reusable authentication and basic authorization for applications. Baloot Auth
is built with NestJS, TypeScript, PostgreSQL, and Prisma ORM 7.

The service provides client-scoped registration and email verification,
password reset, HttpOnly cookie authentication, rotating refresh tokens,
revocable sessions, role-based authorization, and same-client platform
administrator operations.

## Deployment and integration

The deployment uses a Next.js frontend on Vercel, an Nginx reverse proxy and
store-specific NestJS API gateway on Render, and reusable Baloot services
such as Baloot Auth, with Neon for managed PostgreSQL and RabbitMQ for
asynchronous service messaging. The frontend and store gateway are
application-specific; this repository contains only Baloot Auth. See the
[frontend handoff](./docs/frontend-handoff.md) and
[infrastructure guide](./docs/infrastructure.md) for the integration
contract, planned store service boundaries, and Docker deployment.

## Documentation

Start with the [documentation index](./docs/index.md). Guides cover local
setup, the authentication API, security, database and migrations, testing,
infrastructure, and operator procedures.

## Quick Start

Requirements: Node.js, pnpm, PostgreSQL, and environment-specific email
configuration. Prisma ORM 7 is pinned to a stable release.

```bash
pnpm install
```

Copy `.env.example` to an untracked `.env` and configure a local PostgreSQL
database, secrets, email provider, allowed origins, and seed clients.

For a fresh local database, apply the committed initial migration before
seeding:

```bash
pnpm db:migrate:dev
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
making schema or database changes.

See [Infrastructure](./docs/infrastructure.md) for the Vercel, Render,
Docker, Nginx, and Neon deployment architecture, configuration boundaries,
and rollout checklist.

## Project Principles

- Security-first, client-scoped authentication.
- Small, reviewable changes with appropriate tests.
- Reviewed database migrations and environment-appropriate change control.
- Clear API and operator documentation.
