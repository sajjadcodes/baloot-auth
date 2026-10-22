# Platform Administrator Operations

This guide describes how to grant and revoke the global `platform_admin` role
using trusted operator commands. These operations change database role
assignments, so run them only against the intended environment through its
approved operator and change-control process.

## Security Rules

- Never commit `DATABASE_URL`, `SEED_PLATFORM_ADMIN_USERS_JSON`, or other
  environment secrets. Do not paste them into chat, tickets, logs, or shell
  history.
- Use a separate database and credentials for local development, staging, and
  production. Never point a local command or staging job at production.
- Confirm the exact environment, client UUID, normalized account email, and
  intended action before running a command.
- Use an active account whose email has already been verified. Do not grant
  `platform_admin` to an unverified or disabled account.
- These commands are operator-only, not public API operations. Do not expose
  them through an application endpoint, CI job available to untrusted pull
  requests, or general-purpose deployment hook.
- The seed command also creates or updates configured clients and allowed
  origins. Review `SEED_CLIENTS_JSON` and `CORS_ORIGINS` before using it,
  especially outside local development.

The `roles` and `user_roles` tables must already exist in the target database.
The service does not create or apply migrations as part of these procedures.

## Environment Preparation

For each environment, load its values from that environment's protected
configuration:

| Environment       | Configuration source                                                  | Database target                 |
| ----------------- | --------------------------------------------------------------------- | ------------------------------- |
| Local development | Untracked local `.env`                                                | Local development database only |
| Staging           | Staging secret manager or protected operator environment              | Staging database only           |
| Production        | Production secret manager or approved production operator environment | Production database only        |

The commands use `DATABASE_URL`. The grant command also requires the complete,
reviewed `SEED_CLIENTS_JSON` and matching `CORS_ORIGINS` values because it runs
the existing client seed. For shared or production environments, use an
approved one-off operator process with the reviewed application version and
least-privilege database credentials. Do not copy production secrets to an
untrusted workstation.

### Local Development

1. Use an untracked project `.env` with a local-only `DATABASE_URL`,
   `SEED_CLIENTS_JSON`, and `CORS_ORIGINS`.
2. Register and verify a local test account, then use its exact client UUID
   and email in `SEED_PLATFORM_ADMIN_USERS_JSON`.
3. Run the grant or revoke command from the repository root. Confirm the
   target database is local before proceeding.
4. Keep local test accounts and credentials out of shared or production
   configuration.

### Staging

1. Use the staging secret manager or an approved protected operator job to
   inject staging-only `DATABASE_URL`, client configuration, and (for grants)
   `SEED_PLATFORM_ADMIN_USERS_JSON`.
2. Confirm the injected database is staging and that the selected account is
   a staging account. Do not reuse production credentials or account records.
3. Run the command from the reviewed release or commit in an approved operator
   environment. Review the result and verify the grant/revocation against a
   staging-only protected operation.
4. Do not save injected secrets in a checked-out `.env`, build artifact, or
   CI log.

### Production

1. Obtain the organization's required change approval and identify the exact
   production client UUID and verified account email.
2. Run from an approved production operator environment or one-off protected
   job using the reviewed deployed version, production-only secret injection,
   and least-privilege database credentials. Do not copy production secrets
   to a developer workstation or use local `.env` files.
3. For a grant, review the full `SEED_CLIENTS_JSON` and
   `CORS_ORIGINS` as well as the admin target: `pnpm db:seed` also creates or
   updates client and origin records.
4. For a revocation, remove the target from the production grant list first,
   then run the explicit `db:role:revoke` command against the production
   database.
5. Capture the approved change reference and command outcome in the protected
   audit system. Verify the outcome using the production operational
   procedures; never include secrets in the record.

Before making a grant, register the account using the normal flow and complete
email verification. Confirm the email belongs to the intended account and that
the client UUID identifies the intended application. Email uniqueness is
scoped to the client, so the same email can refer to different accounts for
different clients.

## Grant `platform_admin`

1. Prepare the environment-specific database and client configuration.
2. Set `SEED_PLATFORM_ADMIN_USERS_JSON` to the explicit grant list. Use `[]`
   when there are no grants to add. For example:

   ```dotenv
   SEED_PLATFORM_ADMIN_USERS_JSON=[{"clientId":"00000000-0000-4000-8000-000000000001","email":"admin@example.com"}]
   ```

3. Review the target client UUID, email, full `SEED_CLIENTS_JSON`, and
   `CORS_ORIGINS` against the selected environment.
4. From the repository root, run the seed command in that environment:

   ```bash
   pnpm db:seed
   ```

The seed grants the role only when that user exists for the specified client,
is active, and has verified email. It is idempotent. It also provisions
configured clients, origins, and the built-in roles, so do not run it with
partial or unreviewed environment configuration.

`SEED_PLATFORM_ADMIN_USERS_JSON` is a grant list, not a desired-state
reconciliation list. Removing an entry does **not** revoke an existing role.
If an administrator is being removed, first remove their entry from the grant
list so a future seed run cannot re-grant the role, then use the explicit
revocation procedure below.

## Revoke `platform_admin`

1. Load the selected environment's `DATABASE_URL` through its protected
   configuration source.
2. Confirm the exact client UUID and account email. Remove that account from
   `SEED_PLATFORM_ADMIN_USERS_JSON` in the environment's grant configuration
   before a future seed run.
3. Run the explicit revocation command, substituting the intended target:

   ```bash
   pnpm db:role:revoke -- --client-id 00000000-0000-4000-8000-000000000001 --email admin@example.com --confirm
   ```

The required `--confirm` flag makes this an intentional operator action. The
command runs transactionally and removes only the matching
`platform_admin` assignment for that account and client. It does not remove
other roles, disable the account, or revoke refresh sessions. A missing
account is an error; a missing role assignment is reported as a no-op. Do not
omit `--confirm` or use broad SQL deletes.

Role checks read assignments from the database, so the revoked privilege
stops authorizing protected requests immediately. The existing access token
does not need to be replaced for role revocation to take effect.

## Verification and Audit Trail

- Retain the approved change record and the operator, environment, target
  client, target email, command outcome, and timestamp in the organization's
  protected audit system. Never record `DATABASE_URL` or other credentials.
- For a grant, verify the operator command succeeded and use the intended
  administrator account to access a `platform_admin`-only operation in that
  same client.
- For a revocation, verify the command reports a revocation (or the explicit
  no-assignment result). Confirm the former administrator can no longer access
  a `platform_admin`-only operation. Their ordinary `user` access may remain.
- If the outcome is uncertain, inspect only the exact target assignment using
  the approved administrative database process before retrying.
