# Baloot Auth

**Reusable authentication and basic authorization for any application.**

Baloot Auth is a standalone authentication service built with NestJS, TypeScript, PostgreSQL, and Prisma ORM 8. It provides a documented REST API that applications can use for user authentication, session management, and basic role-based authorization.

It is designed to remain independent of any specific product, company, or business domain.

## Implementation Status

The current foundation includes validated startup configuration, request validation, credentialed CORS with an explicit origin allowlist, Swagger/OpenAPI, a Prisma ORM 8 PostgreSQL contract and runtime, Argon2id password hashing, short-lived JWT access-token issuance with a Passport JWT strategy, and a globally applied success-response interceptor and exception filter. Application clients have registered origins; users, email uniqueness, authentication requests, and access tokens are scoped to one client. The root health response and `POST /auth/register`, `POST /auth/login`, and `POST /auth/refresh` are implemented. Logout, current-user, email verification, password reset, and authorization endpoints are not yet available.

HTTP responses use a globally applied envelope: successful responses contain `success`, the HTTP `code`, a `message`, and endpoint `data`; errors contain `success: false`, the HTTP `code`, and a safe `message`. Unexpected server errors are logged server-side without stack traces or exception messages and returned to clients as a generic internal-server-error message.

## Technology Stack

| Technology       | Purpose                           |
| ---------------- | --------------------------------- |
| NestJS           | Backend framework                 |
| TypeScript       | Application language              |
| PostgreSQL       | Persistent data storage           |
| Prisma ORM 8     | PostgreSQL contract and runtime   |
| Prisma CLI       | Contract authoring and migrations |
| JWT              | Access-token format               |
| HttpOnly cookies | Browser token transport           |
| Swagger/OpenAPI  | Interactive API documentation     |

## Repository Structure

The project follows a feature-oriented NestJS architecture:

```text
baloot-auth/
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
│   ├── prisma/
│   │   ├── contract.prisma
│   │   ├── contract.json
│   │   └── contract.d.ts
│   ├── filters/
│   ├── interceptors/
│   ├── types/
│   └── utils/
├── prisma/
│   └── seed.ts
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
- Prisma ORM 8 is currently installed as a release candidate.

### Installation

Install dependencies with pnpm:

```bash
pnpm install
```

Copy `.env.example` to `.env`, then set `DATABASE_URL` to a reachable PostgreSQL database and replace `JWT_ACCESS_SECRET` with a cryptographically random secret of at least 32 characters. `JWT_ACCESS_TTL_SECONDS` must be between 60 and 3600 seconds and defaults to 900. `REFRESH_SESSION_TTL_SECONDS` must be between 3600 and 7776000 seconds and defaults to 2592000. `AUTH_COOKIE_SAME_SITE` accepts `lax`, `strict`, or `none`; `none` is allowed only in production, where cookies are Secure. `CORS_ORIGINS` is a comma-separated list of exact HTTP(S) origins; wildcard origins and paths are not accepted. Provision application clients using `SEED_CLIENTS_JSON` in the untracked `.env`; this JSON array keeps each client's ID, name, and origins together. Keep real deployment origins and client IDs out of committed files. The application validates runtime configuration and connects to PostgreSQL before listening.

Emit the Prisma contract artifacts and start the development server:

```bash
pnpm contract:emit
pnpm db:seed
pnpm start:dev
```

After the maintainer has provisioned the database from the contract, configure `SEED_CLIENTS_JSON` and `CORS_ORIGINS` in `.env`, then run `pnpm db:seed` to provision the client records and the default `user` role required for registration. Each client needs a stable UUID; configure that same public ID in its frontend. Client IDs identify an application but are not secrets. The seed updates existing client names and adds missing client/origin/role records without removing existing origins. Do not commit real `.env` values. The database has not been initialized from the contract. Database migrations remain under maintainer control and must not be created, planned, or applied without explicit approval.

For example, keep the JSON in the local `.env` as a single-line value (replace example values with deployment configuration):

```dotenv
CORS_ORIGINS=http://localhost:5173,https://app.example.com
SEED_CLIENTS_JSON=[{"id":"00000000-0000-4000-8000-000000000001","name":"Example app","origins":["http://localhost:5173","https://app.example.com"]}]
```

## JWT Access-Token Foundation

The auth module issues HS256 access tokens with a configurable lifetime of 60–3600 seconds (900 seconds by default). The Passport JWT strategy extracts access tokens from the HttpOnly access cookie or, for non-browser clients, the `Authorization: Bearer` header; it verifies signature and expiration and maps valid `sub` and `clientId` claims to `request.user.userId` and `request.user.clientId`.

`JWT_ACCESS_SECRET` must be a private, cryptographically random value with at least 32 characters. Never commit or log the production secret.

## Registration

`POST /auth/register` accepts JSON containing `email` and `password` and requires the `X-Client-Id` header containing the UUID of an active registered client. This ID is a public frontend configuration value, not a secret or cookie. The request origin must be allowed globally in `CORS_ORIGINS` and assigned to that client in `client_allowed_origins`. Email is normalized to lowercase; passwords must be 12–128 characters. Email uniqueness is scoped to the client, so the same email can register independently with different applications. The service assigns the `user` role server-side, stores an Argon2id password hash and a SHA-256 hash of a random refresh token in the same database transaction, and rate-limits registration to five requests per minute per source IP.

On success, the response contains only the public user ID and email inside the standard response envelope. The access and refresh tokens are set only as HttpOnly cookies. The access cookie uses `/`; the refresh cookie is scoped to `/auth`. Both are host-only, and use the configured SameSite policy and expiry. Production cookies are Secure. Registration requires an `Origin` header exactly matching one of `CORS_ORIGINS`.

`POST /auth/refresh` accepts the HttpOnly refresh cookie and requires the registered client ID and an allowed request origin. A valid session is rotated atomically: the previous session is revoked and a new hashed refresh token and access token are issued in the authentication cookies. Reuse of a revoked token revokes the user's remaining active refresh sessions. The endpoint is rate-limited to five requests per minute per source IP. `POST /auth/logout` is not implemented yet, so sessions cannot yet be explicitly revoked by clients.

`POST /auth/login` accepts the same `email` and `password` fields and requires the same `X-Client-Id` header and client-specific origin check. Credentials are looked up only within the selected client. Invalid credentials and disabled accounts receive the same generic authentication error. Successful login creates a new hashed refresh session and sets the same HttpOnly cookies as registration. Login is rate-limited to five requests per minute per source IP.

Client records and their allowed origins are stored separately. They are not managed through a public API and must never be created from user-supplied IDs during public registration. Provision clients through a trusted local seed or other controlled administrative process before using registration or login. The browser sends the public client ID in `X-Client-Id`; the server alone sets authentication cookies, because browsers cannot create HttpOnly cookies from frontend code. The client ID and an Origin header are not secrets or proof of identity: non-browser callers can send arbitrary headers, so authentication must continue to rely on credentials and signed tokens.

### Adding an Allowed Origin

An origin is the exact scheme, hostname, and optional port, with no path or trailing slash (for example, `https://your-frontend.example` or `http://localhost:5173`). Allowing an origin requires both a backend CORS change and a database allowlist change; doing only one will not enable browser authentication.

**Backend steps**

1. Add the exact origin to `CORS_ORIGINS` in the backend environment, preserving other comma-separated origins. Keep deployment-specific values in untracked `.env` or deployment environment settings, not in Git.
2. Add the exact origin to that client's `origins` array in `SEED_CLIENTS_JSON` and run `pnpm db:seed` against the configured database. The seed upserts origin rows and leaves existing origins intact. Do not create a second client merely to add another domain for the same application. Client and origin records must be changed through a trusted administrative or deployment process, never through public registration.
3. Restart/redeploy the backend so it loads the changed CORS environment value. Confirm the origin row is present and the client is active.

**Frontend steps**

1. Keep using that application's provisioned public client UUID as the `X-Client-Id` header on `/auth/register` and `/auth/login`, configured through the frontend's public environment/config (for example, `VITE_AUTH_CLIENT_ID` or `NEXT_PUBLIC_AUTH_CLIENT_ID`). Do not generate a new ID when adding a domain, and do not treat the ID as a secret.
2. Send authentication requests with credentials enabled (`credentials: 'include'` with `fetch`, or `withCredentials: true` with Axios). Let the browser set the `Origin` header automatically.
3. Do not create, read, or store the authentication cookies in frontend code; the backend sets HttpOnly cookies. Verify the configured cookie `SameSite`/`Secure` policy is appropriate for the frontend and API deployment domains.

For a new application rather than an additional frontend origin, provision a separate client UUID, name, and allowed-origin rows through a trusted seed or deployment process, then configure that UUID as the frontend's `X-Client-Id`. Public registration must not auto-create client records.

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
| `POST` | `/auth/refresh`         | Implemented: rotate tokens and set authentication cookies       |
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

### Refresh

Send a credentialed `POST` request to `/auth/refresh` with the public `X-Client-Id` header and an allowed origin. The browser sends the HttpOnly refresh cookie automatically. The service rotates the session and sets new cookies; it never returns tokens in the response body. Reusing a revoked refresh token revokes that user's active refresh sessions.

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

Baloot Auth uses PostgreSQL and Prisma ORM 8.

The data contract is maintained in `src/prisma/contract.prisma`. After changing it, run `pnpm contract:emit` and commit the updated `contract.json` and `contract.d.ts` artifacts with the source contract. The Nest service uses the Prisma ORM 8 PostgreSQL runtime; it does not use Prisma 7's generated `PrismaClient` or driver adapter.

**Database migrations are controlled by the project maintainer.**

AI coding agents and automated development workflows must not create, apply, run, reset, or deploy migrations without the maintainer's explicit confirmation.

When a schema change is needed:

1. Update the Prisma data contract.
2. Explain the intended database changes and their impact.
3. Propose the required Prisma ORM 8 migration planning and apply commands.
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
