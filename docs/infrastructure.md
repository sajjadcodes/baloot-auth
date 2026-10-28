# Infrastructure and Deployment

## Target architecture

The planned production request path is:

```text
Browser -> Vercel (Next.js frontend)
       \-> Render (Nginx -> NestJS API gateway -> domain services)
                                      domain services <-> RabbitMQ
                                      data owners ----> Neon PostgreSQL
```

- **Frontend:** Next.js application deployed on Vercel.
- **API edge:** Nginx on Render routes `/auth/*` to the NestJS API gateway.
- **API gateway:** A separate NestJS application that proxies auth requests
  to Baloot Auth, supplies the approved client ID, and preserves origin and
  cookie headers.
- **Authentication service:** This repository's NestJS Baloot Auth service.
- **Database:** Managed PostgreSQL hosted by Neon.
- **API hosting:** Render, using Docker for Nginx and the NestJS services.
- **Messaging:** RabbitMQ for asynchronous events, commands, and durable
  background work shared by the domain services.
- **Source and deployment workflow:** GitHub.

This is the intended topology, not a claim that the gateway, Nginx
configuration, Dockerfiles, or frontend already exist in this repository.
Confirm Render's current Docker service and private networking capabilities
before choosing whether Nginx, the gateway, and Baloot Auth are separate
services or co-located containers. Do not assume Render runs a
multi-container Docker Compose application.

## Store service boundaries

These are the planned domain boundaries for a single-merchant store selling
its own products. They do not all need to be separate deployable applications
in the first release; keep clear modules and split services when independent
scaling, ownership, or deployment needs justify it.

1. **`baloot-auth`** — customer authentication, sessions, and roles. This is
   the service in this repository.
2. **`baloot-gateway`** — public API entry point that routes requests to
   internal services and applies shared request policies.
3. **`baloot-catalog`** — product descriptions, variants, categories, SKUs,
   and publication state.
4. **`baloot-inventory`** — stock levels, reservations, and adjustments.
5. **`baloot-order`** — carts, checkout, coupon and discount rules, tax and
   price calculation, order lifecycle, and fulfillment/shipping status and
   tracking. Keep cart, tax, discounts, coupons, and fulfillment as modules
   inside this service rather than separate services.
6. **`baloot-pay`** — payment-provider integration, payment state, refunds,
   and signed provider webhooks. It reports verified payment outcomes to
   `baloot-order`; the order service owns order-state transitions.
7. **`baloot-relay`** — transactional email and other notifications, such as
   verification messages, order confirmations, shipping updates, and refunds.

Keep ownership clear: catalog owns product information, inventory owns stock,
order owns the purchase and its lifecycle, and pay owns provider-specific
payment state. Snapshot product details, prices, discounts, tax, and totals on
each order so later catalog or pricing changes do not alter purchase history.
Use RabbitMQ for asynchronous events and commands between services as the
system grows.

## Shared platform services

These support the business services; they are not additional `baloot-*`
domain services:

- **Nginx** — public API ingress and routing.
- **Next.js on Vercel** — customer storefront.
- **Docker and Render** — deployment for the API-side services.
- **Neon PostgreSQL** — persistent storage. Keep service data ownership clear;
  do not let services directly modify another service's tables.
- **RabbitMQ** — message broker for durable asynchronous service-to-service
  events and commands. It is shared infrastructure, not a `baloot-*` business
  service.
- **Metrics and dashboards** — instrument each service and collect metrics
  with Prometheus; visualize and alert with Grafana. An OpenTelemetry
  Collector is optional when a shared telemetry pipeline is useful. This
  does not require a separate metrics business service.
- **Logs, tracing, secrets management, and backups** — add the operational
  components needed for production support.

## RabbitMQ event-driven integration

Use RabbitMQ when a service needs to announce a committed business change or
request work from another service without making the originating HTTP request
wait for every downstream operation. Keep synchronous request/response calls
for operations that must return an immediate result, such as a catalog read
or a checkout validation result. Do not use the broker as a substitute for
service APIs or as a shared database.

### Service responsibilities

| Service            | Publish                                                                                                         | Consume                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `baloot-catalog`   | `catalog.product-created`, `catalog.product-updated`, `catalog.product-published`, `catalog.product-archived`   | Inventory setup/update commands if the product workflow requires them.                                                                  |
| `baloot-inventory` | `inventory.stock-adjusted`, `inventory.stock-reserved`, `inventory.stock-released`, `inventory.stock-committed` | Order reservation/release requests; catalog product lifecycle events where appropriate.                                                 |
| `baloot-order`     | `order.placed`, `order.cancelled`, `order.fulfillment-updated`, `order.completed`                               | Payment succeeded/failed/refunded events; inventory reservation results; catalog/inventory events needed to update its own read models. |
| `baloot-pay`       | `payment.succeeded`, `payment.failed`, `payment.refunded`                                                       | Payment creation/refund commands from the order workflow and provider webhook work.                                                     |
| `baloot-relay`     | Normally none for core delivery; optionally notification delivery status events                                 | Selected order, payment, and auth events that require customer notification.                                                            |
| `baloot-auth`      | Optional account lifecycle events, such as `auth.user-registered`                                               | Only events needed for an auth-owned responsibility; it remains the source of truth for identity and sessions.                          |

These are illustrative event names and ownership boundaries, not implemented
contracts. Define payload schemas and versions before consumers depend on
them. Events should describe facts that have already happened; commands ask a
specific service to perform work. For example, `order.placed` is a fact,
whereas a stock reservation request is a command.

### Exchange and queue layout

Use a durable topic exchange for domain events, with routing keys such as
`order.placed` and `payment.succeeded`. Give each consuming service its own
durable queue bound to only the event patterns it needs. If both `baloot-relay`
and `baloot-order` need `payment.succeeded`, bind separate queues so each
service receives the event; multiple replicas of one consumer may share that
service's queue for competing-consumer processing.

Route commands to the queue owned by the target service, for example an
inventory reservation command to an inventory command queue. Return command
results as events or explicit replies with correlation IDs. Keep queue names,
bindings, retry queues, and dead-letter exchanges in version-controlled
deployment configuration. The gateway handles synchronous HTTP routing and
should not own business events or consume domain queues.

### Order and payment flow

1. `baloot-order` validates current catalog/price data and requests an
   inventory reservation. Inventory is authoritative for stock; a stale
   cached quantity must never decide whether an order can be fulfilled.
2. After reservation succeeds, `baloot-order` persists a pending order and
   its line-item, price, discount, tax, and total snapshots.
3. `baloot-order` requests payment creation from `baloot-pay`. Use an
   idempotency key tied to the order/payment attempt so retries do not create
   duplicate charges.
4. `baloot-pay` verifies provider webhook signatures, persists the provider
   outcome, and publishes a payment result. It must not treat a browser
   success/return page as proof of payment.
5. `baloot-order` consumes the payment result idempotently and owns the order
   state transition. It then requests inventory commitment and publishes
   `order.placed`/the appropriate fulfillment-ready event only according to
   the agreed state machine.
6. On cancellation or payment failure, order coordinates reservation
   release and any required refund. Make each operation retry-safe and
   reconcile uncertain provider or broker outcomes.

Specify the exact state machine and when an order is considered placed
before implementation; the sequence above is a starting point, not a
replacement for that design.

### Reliability requirements

- **Transactional outbox:** A service writes its business change and an
  outbox row in the same database transaction. A publisher sends pending
  outbox records to RabbitMQ using publisher confirms and marks them sent
  only after confirmation. This prevents a committed order/payment change
  from silently losing its event. Do not publish inside a database
  transaction and assume the two systems commit atomically.
- **Durable delivery:** Use durable exchanges and queues, persistent
  messages, manual consumer acknowledgements, and an appropriate replicated
  queue type for the deployment. Set bounded message sizes and retention.
- **At-least-once and idempotency:** Expect redelivery; do not promise
  exactly-once delivery. Include a stable event/message ID and schema version.
  Consumers should deduplicate using a durable inbox/processed-message
  record with a uniqueness constraint, committed atomically with the
  consumer's database changes.
- **Retries and dead letters:** Retry transient errors with bounded
  backoff. Route exhausted or invalid messages to a dead-letter queue, alert
  operators, and provide a safe inspection/replay procedure. Avoid immediate
  infinite requeue loops.
- **Ordering:** Assume messages may be duplicated and can arrive out of
  order across queues/consumers. Include aggregate IDs and sequence/version
  where ordering matters, and enforce valid state transitions at the owning
  service.
- **Contracts:** Version event schemas compatibly; include event ID, event
  type, schema version, occurrence time, producer, and aggregate ID. Avoid
  secrets, payment credentials, and unnecessary personal data in messages.
- **Operations:** Monitor queue depth, oldest-message age, consumer errors,
  redeliveries, dead-letter counts, and broker availability. Keep broker
  credentials private and restrict network access to service workloads.

Start with RabbitMQ for both asynchronous inter-service messaging and
background jobs that need durable delivery. BullMQ is not needed by default;
it adds a separate Redis-backed queue system. Consider it only if a concrete
Redis-specific job feature is needed and the operational cost of running a
second broker is justified. Redis caching, if later added, remains separate
from RabbitMQ's durable messaging role.

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
- [ ] Provision private RabbitMQ access for publishers/consumers, including
      durable queues, retry/dead-letter handling, monitoring, and protected
      credentials.
- [ ] Implement outbox publishing and idempotent consumers before relying on
      messages for order, inventory, payment, or notification correctness.
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
