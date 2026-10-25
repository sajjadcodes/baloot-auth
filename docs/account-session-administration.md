# Account and Session Administration

These administrative endpoints are restricted to `platform_admin` users and
operate only within the administrator's client. Requests must include the
client ID matching the authenticated access token and a trusted browser origin.
The routes use `JwtAuthGuard`, `AdminClientGuard`, and `RolesGuard` in that
order.

## Operations

| Method   | Endpoint                                        | Effect                                                                                                                          |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/auth/admin/users/:userId/sessions`            | Lists the target user's active session IDs and timestamps. It never returns refresh-token material.                             |
| `PATCH`  | `/auth/admin/users/:userId/disable`             | Disables the account and revokes every associated authentication and refresh session. Administrators cannot disable themselves. |
| `PATCH`  | `/auth/admin/users/:userId/enable`              | Re-enables the account. Previously revoked sessions stay revoked; the user must authenticate again.                             |
| `DELETE` | `/auth/admin/users/:userId/sessions/:sessionId` | Revokes the selected session and its refresh tokens. Access tokens for that session stop working immediately.                   |

Account state changes, session revocations, and their audit events are written
in the same database transaction. If the audit insert fails, the corresponding
state change rolls back. `admin_audit_events` records the client, actor, target,
action, optional session ID, and timestamp. The application only appends audit
events; operational database access must be restricted, and retention and
backup policies must protect the records. Failed authorization attempts are
not written to this table and should be captured by the organization's
centralized security logging.

The access-token JWT contains a session ID. The JWT strategy checks that this
session is active and unexpired and that its account is active and verified.
This database check makes logout, password reset, administrative session
revocation, and account disablement immediately effective for authenticated
requests. Refresh-token rotation retains the same session ID while replacing
the hashed refresh token.

## Schema rollout

The Prisma 7 schema in `prisma/schema.prisma` defines `auth_sessions`, the
`refresh_sessions.session_id` relationship, and `admin_audit_events`. The
initial SQL migration is in `prisma/migrations/20261025_init/`. Review the
target environment's schema and migration history before applying it; this
initial migration is only for a fresh database. Follow
[Database and migrations](./database.md) for schema changes and deployment.
