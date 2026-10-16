# Baloot Auth

**Reusable authentication and basic authorization for any application.**

Baloot Auth is a standalone authentication service built with NestJS, TypeScript, PostgreSQL, and Prisma 7. It provides a documented REST API that applications can use for user authentication, session management, and basic role-based authorization.

It is designed to remain independent of any specific product, company, or business domain.

## Implementation Status

The current foundation includes validated startup configuration, request validation, credentialed CORS with an explicit origin allowlist, Swagger/OpenAPI, the initial Prisma 7 PostgreSQL schema and adapter, Argon2id password hashing, short-lived JWT access-token issuance with a Passport JWT strategy, and a globally applied success-response interceptor and exception filter. The root health response and `POST /auth/register` and `POST /auth/login` are implemented. Refresh, logout, current-user, email verification, password reset, and authorization endpoints are not yet available.

HTTP responses use a globally applied envelope: successful responses contain `success`, the HTTP `code`, a `message`, and endpoint `data`; errors contain `success: false`, the HTTP `code`, and a safe `message`. Unexpected server errors are logged server-side without stack traces or exception messages and returned to clients as a generic internal-server-error message.

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
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth-cookies.service.ts
│   │   ├── access-token.service.ts
│   │   ├── password.service.ts
│   │   ├── dto/
│   │   ├── guards/
│   │   └── strategies/
│   ├── config/
│   ├── database/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── filters/
│   ├── interceptors/
│   ├── types/
│   └── utils/
├── prisma.config.ts
├── .env.example
├── .gitignore
├── AGENTS.md
├── README.md
├── package.json
└── tsconfig.json
```

The structure may evolve as features are implemented. Each service, controller, and helper has colocated unit tests (for example, `auth.service.ts` and `auth.service.spec.ts`). Tests are run with `pnpm test -- --runInBand`. End-to-end and integration tests are currently out of scope.

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

Copy `.env.example` to `.env`, then set `DATABASE_URL` to a reachable PostgreSQL database and replace `JWT_ACCESS_SECRET` with a cryptographically random secret of at least 32 characters. `JWT_ACCESS_TTL_SECONDS` must be between 60 and 3600 seconds and defaults to 900. `REFRESH_SESSION_TTL_SECONDS` must be between 3600 and 7776000 seconds and defaults to 2592000. `AUTH_COOKIE_SAME_SITE` accepts `lax`, `strict`, or `none`; `none` is allowed only in production, where cookies are Secure. `CORS_ORIGINS` is a comma-separated list of exact HTTP(S) origins; wildcard origins and paths are not accepted. The application validates these values at startup and connects to PostgreSQL before listening.

Generate the Prisma Client and start the development server:

```bash
pnpm db:generate
pnpm start:dev
```

The Prisma schema has not been migrated to the database. Database migrations remain under maintainer control and must not be generated or applied without explicit approval.

## JWT Access-Token Foundation

The auth module issues HS256 access tokens with a configurable lifetime of 60–3600 seconds (900 seconds by default). The Passport JWT strategy extracts access tokens from the HttpOnly access cookie or, for non-browser clients, the `Authorization: Bearer` header; it verifies signature and expiration and maps a valid `sub` claim to `request.user.userId`.

`JWT_ACCESS_SECRET` must be a private, cryptographically random value with at least 32 characters. Never commit or log the production secret.

## Registration

`POST /auth/register` accepts JSON containing `email` and `password`. Email is normalized to lowercase; passwords must be 12–128 characters. The service assigns the `user` role server-side, stores an Argon2id password hash and a SHA-256 hash of a random refresh token in the same database transaction, and rate-limits registration to five requests per minute per client.

On success, the response contains only the public user ID and email inside the standard response envelope. The access and refresh tokens are set only as HttpOnly cookies. The access cookie uses `/`; the refresh cookie is scoped to `/auth`. Both are host-only, and use the configured SameSite policy and expiry. Production cookies are Secure. Registration requires an `Origin` header exactly matching one of `CORS_ORIGINS`.

The `/auth/refresh` and `/auth/logout` endpoints are not implemented yet, so refresh sessions created during registration or login cannot yet be rotated or revoked through the API.

`POST /auth/login` accepts the same `email` and `password` fields, normalizes the email, and verifies the password against the stored Argon2id hash. Invalid credentials and disabled accounts receive the same generic authentication error. Successful login creates a new hashed refresh session and sets the same HttpOnly cookies as registration. Login requires a trusted `Origin` and is rate-limited to five requests per minute.

## API Documentation

Baloot Auth uses Swagger/OpenAPI to document its REST API.

When the service is running locally, interactive API documentation is available at:

`http://localhost:3000/api/docs`

The actual host and port depend on the application configuration.

Swagger documents implemented operations and request DTOs. Endpoint operation summaries and DTO property decorators are used; API response decorators are intentionally not used.

The root `GET /`, `POST /auth/register`, and `POST /auth/login` endpoints are currently implemented. Their successful results are wrapped in the standard response envelope.

## API Reference

The authentication endpoint status is:

| Method | Endpoint                | Purpose                                                         |
| ------ | ----------------------- | --------------------------------------------------------------- |
| `POST` | `/auth/register`        | Implemented: register a user and set authentication cookies     |
| `POST` | `/auth/login`           | Implemented: authenticate a user and set authentication cookies |
| `POST` | `/auth/refresh`         | Planned: refresh and rotate tokens                              |
| `POST` | `/auth/logout`          | Planned: revoke a session and clear cookies                     |
| `GET`  | `/auth/me`              | Planned: retrieve the authenticated user's information          |
| `POST` | `/auth/verify-email`    | Planned: verify an email address                                |
| `POST` | `/auth/forgot-password` | Planned: request a password reset                               |
| `POST` | `/auth/reset-password`  | Planned: reset a password                                       |

Refer to Swagger for the exact request formats, response contracts, validation requirements, and error codes.

## Browser Authentication

Browser registration sets both access and refresh tokens as HttpOnly cookies.

Browser clients must not read or manually store these tokens in JavaScript.

### Login

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
