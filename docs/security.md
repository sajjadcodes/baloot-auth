# Security

Baloot Auth is designed around client-scoped identity, server-managed
credentials, and explicit authorization. Applications using it remain
responsible for their own business rules and resource-level permissions.

## Authentication tokens

- Use a private, cryptographically random `JWT_ACCESS_SECRET` of at least 32
  characters.
- Keep password-reset and email-verification signing secrets private and
  distinct from each other and from the access-token secret.
- Access tokens are short-lived and contain a session ID. The JWT strategy
  checks the session and account status in the database on each authenticated
  request.
- Refresh tokens are opaque random values; only their hashes are stored.
- Never put tokens in URLs, logs, `localStorage`, or `sessionStorage`.
- Never expose HttpOnly cookies to frontend JavaScript.

## Cookies and CSRF

Use HTTPS in production. Configure `HttpOnly`, `Secure`, `SameSite`, expiry,
and cookie scope deliberately. `SameSite` accepts `lax`, `strict`, or `none`;
`none` is permitted only in production, where cookies are Secure.

All state-changing auth routes use `TrustedOriginGuard`. It requires an
`Origin` header, checks exact membership in `CORS_ORIGINS`, and verifies the
origin belongs to the active client selected by `X-Client-Id`. This is an
origin-based CSRF defense independent of CORS enforcement. CORS alone is not
the security check.

When a NestJS gateway proxies browser requests, it must forward the original
`Origin`, `Cookie`, and configured `X-Client-Id` to Baloot Auth. Do not replace
the browser's origin with an internal service origin. Configure the exact
public frontend origin both in `CORS_ORIGINS` and in that client's registered
allowed origins.

Browser JavaScript cannot arbitrarily set the `Origin` header, but
non-browser callers can. Neither `Origin` nor `X-Client-Id` is proof of
identity. This defense does not protect against XSS on a trusted origin.

## Client isolation

Use a separate database and credentials for each environment. Register clients
and allowed origins through trusted seed/deployment procedures. Never accept a
client ID from registration data or create clients through the public API.
Use the same stable client UUID in the frontend's public configuration and the
`X-Client-Id` header.

Admin routes are scoped to the authenticated administrator's client.
`AdminClientGuard` requires the request client ID to match the token's client
ID; `RolesGuard` checks current active/verified account state and role
assignments in the database. Admin guard order is `JwtAuthGuard`,
`AdminClientGuard`, then `RolesGuard` (after throttling and trusted-origin
checks).

## Role and account administration

Public registration assigns only the `user` role. Grant `platform_admin` only
through the trusted seed workflow or another approved operator process; never
through public registration or client-controlled inputs.

Account disablement and session revocation are same-client, platform-admin
operations. These actions revoke auth sessions and invalidate corresponding
access tokens immediately. Re-enabling an account does not restore its
revoked sessions. Administrators cannot disable themselves. Successful
mutations append an audit event in the same transaction as the state change;
protect audit records with suitable database access controls, backups, and
retention policies. Failed authorization attempts should be captured by the
central security logging system.

For operator procedures see [Platform administrator operations](./platform-admin-operations.md)
and [Account and session administration](./account-session-administration.md).

## Deployment checklist

- Use HTTPS and environment-specific secrets.
- Do not commit `.env` values, database URLs, or API credentials.
- Keep host and database credentials in their respective protected
  configuration systems; do not include them in build artifacts or logs.
- For the Docker deployment, expose only Nginx publicly; keep the gateway and
  Baloot Auth reachable only through the intended private network. Do not
  publish the database port.
- Preserve `Set-Cookie` and `Cookie` headers through every proxy. Never log
  cookie values or return authentication tokens to frontend JavaScript.
- For the Vercel, Render, and Neon deployment, verify current provider-specific
  ingress, TLS, database connection, and plan guidance before configuring
  production. Do not rely on Vercel preview domains as trusted origins unless
  each exact origin is intentionally approved and provisioned.
- Configure exact trusted frontend origins globally and per client.
- Keep cookies HttpOnly and do not store tokens in browser storage.
- Rate-limit public authentication endpoints and monitor the service's safe
  error logs.
- Restrict operator commands and database access to approved personnel.
