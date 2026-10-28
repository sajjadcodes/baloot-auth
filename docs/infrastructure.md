# Infrastructure and Deployment

## Target architecture

The planned production request path is:

```text
Browser -> Vercel (Next.js frontend)
       \-> Render (Nginx -> NestJS API gateway -> Baloot Auth) -> Neon PostgreSQL
```

- **Frontend:** Next.js application deployed on Vercel.
- **API edge:** Nginx on Render routes `/auth/*` to the NestJS API gateway.
- **API gateway:** A separate NestJS application that proxies auth requests
  to Baloot Auth, supplies the approved client ID, and preserves origin and
  cookie headers.
- **Authentication service:** This repository's NestJS Baloot Auth service.
- **Database:** Managed PostgreSQL hosted by Neon.
- **API hosting:** Render, using Docker for Nginx and the NestJS services.
- **Source and deployment workflow:** GitHub.

This is the intended topology, not a claim that the gateway, Nginx
configuration, Dockerfiles, or frontend already exist in this repository.
Confirm Render's current Docker service and private networking capabilities
before choosing whether Nginx, the gateway, and Baloot Auth are separate
services or co-located containers. Do not assume Render runs a
multi-container Docker Compose application.

## Application configuration

Baloot Auth reads and validates its configuration from environment variables.
See [Getting started](./getting-started.md) and
[`.env.example`](../.env.example) for its complete list of required and
optional variables. The gateway and frontend have their own configuration;
do not place Baloot Auth secrets in the Next.js client bundle.

The current application expects:

- `PORT` for the HTTP listener.
- `DATABASE_URL` for its PostgreSQL runtime connection.
- The exact browser-visible Vercel frontend origin in `CORS_ORIGINS` and the
  corresponding client origin seed configuration.
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
generates Prisma Client and does not need database credentials. Use the Neon
connection string and select a connection mode supported by Neon, Render, and
the installed Prisma runtime.

## Vercel frontend and browser cookies

The browser uses the Vercel frontend's production custom domain. Route auth
requests through the Render Nginx/gateway endpoint; do not expose Baloot Auth
or Neon directly. Prefer a custom frontend domain and a custom API domain
under the same site, for example `app.example.com` and `api.example.com`.
Configure browser requests with `credentials: 'include'` when calling the
separate API origin and configure Baloot Auth CORS for the exact frontend
origin. The browser-visible `Origin` must reach Baloot Auth unchanged.

Authentication cookies are host-only: if the browser calls
`api.example.com`, the cookies belong to that API host and will be sent to it
on subsequent credentialed calls; they are not available to the frontend
JavaScript or sent to `app.example.com`. If the frontend uses a
`*.vercel.app` origin while the API uses an unrelated domain, the request is
cross-site and requires `SameSite=None; Secure`; browser third-party-cookie
policies may still block it. Prefer custom domains under the same site and
verify login, refresh, and logout in real browsers.

If configuring a Vercel rewrite so the browser calls a same-origin `/auth/*`
path, verify that it forwards the original `Origin` and `Cookie` headers and
relays each upstream `Set-Cookie` header without rewriting attributes. See
[Frontend handoff](./frontend-handoff.md).

## Build and process

The Baloot Auth repository's current commands are:

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run start:prod
```

The production entry point is `dist/src/main.js`. The NestJS bootstrap reads
`PORT` through validated application configuration and enables shutdown
hooks. In production this application currently binds to `127.0.0.1`. Before
putting Nginx or the gateway in a separate container/service, change the
service to bind to an interface reachable on the private container network
(typically `0.0.0.0`) and keep it inaccessible from the public internet except
through the intended proxy path.

This repository currently has no Dockerfile, Nginx configuration, or gateway
application. Build and deploy those as explicit components; ensure the
production image runs `pnpm run build` so Prisma Client is generated from the
committed schema before Nest is compiled.

The Baloot Auth image should install dependencies from the lockfile, build,
and start with `pnpm run start:prod`. Do not copy a developer's local `dist`
or generated Prisma directory into the image as a substitute for the build.
Use Docker multi-stage build outputs that retain all generated Prisma
JavaScript files, including `dist/src/generated/prisma/internal/` and
`models/`.

Nginx should route the public `/auth/...` path to the gateway without
stripping or adding a path prefix. This is required because the refresh cookie
is scoped to `Path=/auth`. The gateway must forward the incoming `Origin` and
`Cookie` headers, set/validate the approved `X-Client-Id`, and relay upstream
`Set-Cookie` headers as separate headers without rewriting their attributes.
See [Frontend handoff](./frontend-handoff.md) for the complete contract.

## Database and migration rollout

The project uses a Prisma ORM 7 schema and committed SQL migrations. Review
[Database and migrations](./database.md) before changing the schema.

Before connecting a Neon database:

1. Confirm the Neon project and database are the intended target.
2. Choose a connection mode supported by Neon, Render, and the Prisma runtime
   version in this repository.
3. Store the connection string as a protected `DATABASE_URL` without printing
   or committing it.
4. Inspect the database and migration history before applying anything.
5. Back up any data that must be retained and test the migration against a
   suitable non-production database first.
6. Apply only reviewed migrations with `pnpm db:migrate:deploy`.

Do not reset or recreate a database containing data. The committed initial
migration creates the complete schema from the Prisma 7 model. Do not assume the target database is empty or treat this baseline as a
migration for an existing populated schema.

## Deployment checklist

- [ ] Confirm current Vercel frontend domain/preview behavior and Render
      Docker, build, start, port, health-check,
      networking, and plan requirements using official documentation.
- [ ] Build and deploy the Nginx and NestJS gateway components; keep backend
      service addresses private.
- [ ] Verify container-network reachability: the gateway and Nginx can reach
      their upstreams, while public clients cannot bypass Nginx.
- [ ] Confirm current Neon PostgreSQL connection and pooling guidance for
      the Prisma runtime version used by this project.
- [ ] Configure GitHub deployment from the intended branch and repository.
- [ ] Add required environment values through protected host configuration.
- [ ] Confirm the Vercel production frontend origin, client origins, email
      sender, and HTTPS verification/reset URLs.
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

For startup failures, inspect the relevant Render service logs and confirm
the Docker build/start commands, container network routes, and required
environment variables. Never print secrets or share unredacted logs.

For database failures, verify that the configured URL targets the intended
Neon database and that the selected connection mode is supported by Neon,
Render, and the installed Prisma runtime. Do not disable TLS or switch to a
weaker connection mode as a workaround.
