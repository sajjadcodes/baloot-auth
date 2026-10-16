# Baloot Auth

**Reusable authentication and basic authorization for any application.**

Baloot Auth is a standalone authentication service built with NestJS, TypeScript, PostgreSQL, and Prisma 7. It provides a documented REST API that applications can use for user authentication, session management, and basic role-based authorization.

It is designed to remain independent of any specific product, company, or business domain.

## Implementation Status

The current foundation includes startup environment validation, request validation, credentialed CORS with an explicit origin allowlist, Swagger/OpenAPI, the initial Prisma 7 PostgreSQL schema and adapter, and an Argon2id password-hashing service. Registration, login, and authorization endpoints remain planned and are not yet available.

## Technology Stack

| Technology       | Purpose                            |
| ---------------- | ---------------------------------- |
| NestJS           | Backend framework                  |
| TypeScript       | Application language               |
| PostgreSQL       | Persistent data storage            |
| Prisma 7         | ORM and database schema management |
| Prisma Migrate   | Database migration tooling         |
| JWT              | Access-token format                |
| HttpOnly cookies | Browser token transport            |
| Swagger/OpenAPI  | Interactive API documentation      |

## Repository Structure

The project follows a feature-oriented NestJS architecture:

```text
baloot-auth/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   ├── common/
│   ├── database/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── dto/
│   │   ├── guards/
│   │   └── strategies/
│   ├── users/
│   ├── roles/
│   ├── sessions/
│   ├── email-verification/
│   ├── password-reset/
│   └── health/
├── test/
│   ├── unit/
│   └── integration/
├── prisma.config.ts
├── .env.example
├── .gitignore
├── AGENTS.md
├── README.md
├── package.json
└── tsconfig.json
```

The structure may evolve as the service develops. Some directories will be introduced only when their corresponding features are implemented.

## Getting Started

### Prerequisites

- Node.js and a compatible package manager.
- PostgreSQL.
- The project dependencies installed from `package.json`.

### Installation

Install dependencies with pnpm:

```bash
pnpm install
```

Copy `.env.example` to `.env`, then set `DATABASE_URL` to a reachable PostgreSQL database. `CORS_ORIGINS` is a comma-separated list of exact HTTP(S) origins; wildcard origins and paths are not accepted. The application validates these values at startup and connects to PostgreSQL before listening.

Generate the Prisma Client and start the development server:

```bash
pnpm db:generate
pnpm start:dev
```

The Prisma schema has not been migrated to the database. Database migrations remain under maintainer control and must not be generated or applied without explicit approval.

## API Documentation

Baloot Auth uses Swagger/OpenAPI to document its REST API.

When the service is running locally, interactive API documentation is available at:

`http://localhost:3000/api/docs`

The actual host and port depend on the application configuration.

Swagger documents available endpoints, request DTOs, response schemas, status codes, and authentication requirements.

## API Reference

The following endpoints define the planned authentication API. Availability depends on the implemented version.

| Method | Endpoint                | Purpose                                 |
| ------ | ----------------------- | --------------------------------------- |
| `POST` | `/auth/register`        | Register a user                         |
| `POST` | `/auth/login`           | Authenticate a user                     |
| `POST` | `/auth/refresh`         | Refresh and rotate tokens               |
| `POST` | `/auth/logout`          | Revoke a session and clear cookies      |
| `GET`  | `/auth/me`              | Retrieve the current user's information |
| `POST` | `/auth/verify-email`    | Verify an email address                 |
| `POST` | `/auth/forgot-password` | Request a password reset                |
| `POST` | `/auth/reset-password`  | Reset a password                        |

Refer to Swagger for the exact request formats, response contracts, validation requirements, and error codes.

## Planned Browser Authentication

When browser authentication is implemented, both access and refresh tokens must use HttpOnly cookies.

Browser clients must not read or manually store these tokens in JavaScript.

### Planned Login

Send credentials to `POST /auth/login`. After successful authentication, the service sets the access and refresh cookies using the configured security attributes.

### Planned Authenticated Requests

The browser sends cookies automatically when the request matches their cookie scope and the request's credential settings.

For a cross-origin frontend, configure the HTTP client to include credentials and configure the server's CORS policy to allow the specific frontend origin.

### Planned Refresh

Send a request to `POST /auth/refresh`. The service validates the refresh session, rotates the refresh token when appropriate, and updates the cookies.

### Planned Logout

Send a request to `POST /auth/logout`. The service revokes the relevant refresh session and clears the authentication cookies.

### Security Requirements

- Use HTTPS in production.
- Configure `HttpOnly`, `Secure`, `SameSite`, expiration, and cookie scope appropriately.
- Implement CSRF protection for cookie-authenticated state-changing requests.
- Never place tokens in URLs or logs.
- Never use `localStorage` or `sessionStorage` for browser authentication tokens.

HttpOnly cookies prevent JavaScript from reading token values, but they do not independently prevent CSRF attacks.

## Planned Roles and Authorization

Baloot Auth begins with two global roles:

- `user`: The default role for registered users.
- `platform_admin`: A privileged role for platform-level administration.

Public registration cannot assign privileged roles.

These roles provide basic authorization. Applications using Baloot Auth remain responsible for their own business rules and resource-level permissions.

A valid identity does not automatically authorize access to every resource.

## Database and Migrations

Baloot Auth uses PostgreSQL and Prisma 7.

The Prisma schema is maintained in `prisma/schema.prisma`, and Prisma configuration is maintained according to the installed Prisma 7 conventions.

**Database migrations are controlled by the project maintainer.**

AI coding agents and automated development workflows must not create, apply, run, reset, or deploy migrations without the maintainer's explicit confirmation.

When a schema change is needed:

1. Update the Prisma schema.
2. Explain the intended database changes and their impact.
3. Propose the required migration command.
4. Wait for explicit confirmation before creating or executing the migration.

Do not bypass this process through scripts or alternative database tools.

## Development and Contributions

Keep changes small, focused, and easy to review.

Use Conventional Commit-style messages:

```text
feat: add user registration
```

For more complex changes, include a descriptive commit body:

```text
feat: add refresh token rotation

Rotate refresh tokens after successful refresh requests.
Revoke previous session tokens and reject detected reuse.
Add tests for session rotation and revocation.
```

Add appropriate tests for new functionality and update Swagger documentation when API contracts change.

See `AGENTS.md` for the full architecture, security requirements, implementation roadmap, and AI coding-agent instructions.

## Project Principles

- Security first.
- Clear separation of responsibilities.
- Reusable APIs and minimal coupling.
- Simple, maintainable architecture.
- Explicit database migration approval.
- Small, well-documented changes.
- Accurate API documentation.

**Baloot Auth — Authentication you can reuse across applications.**
