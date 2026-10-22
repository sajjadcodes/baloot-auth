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

The source contract in `src/prisma/contract.prisma` defines `auth_sessions`,
the `refresh_sessions.session_id` relationship, and `admin_audit_events`.
Apply the corresponding migration before deploying an application version
that depends on these objects. Check the target environment's migration
history before applying it or planning a further schema change.

The generated migration adds `refresh_sessions.session_id` as a required
column and checks that `refresh_sessions` is empty before applying it. This
precondition must hold in every target environment; the migration does not
backfill existing refresh-session rows. Existing access tokens do not contain
a session ID and will be rejected after the new strategy is deployed. Since
the table is empty at migration time, affected users must authenticate again
to create a new session.

Before applying the migration to a target environment, verify that
`refresh_sessions` is empty and review the migration:

```bash
pnpm prisma migration show migrations/app/20261017T0058_admin_account_session_management
```

Apply it with `pnpm prisma db migrate --db $DATABASE_URL --advance-ref db`
through the approved process for that environment. Re-emit the contract with
`pnpm contract:emit` after any further contract changes. Plan the schema and
application rollout together; do not deploy an application version that
depends on objects missing from the database.
