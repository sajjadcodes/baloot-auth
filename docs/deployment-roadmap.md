# AWS Deployment Roadmap

This roadmap tracks Baloot Auth on the shared AWS EC2 and private RDS
infrastructure. Live-state notes below are based on command output supplied by
the owner; recheck AWS and host state before making changes. Never put
passwords, tokens, or secret values in this document.

## Current verified state

- The Auth hostname is `auth.balootix.com`. It resolved to `44.200.50.145`,
  and the owner confirmed this matches the EC2 public IPv4 at the time. The
  address may change unless it is an Elastic IP; confirm its current
  association and update DNS if required.
- The EC2 host is Amazon Linux 2023, accessed through Systems Manager Session
  Manager. Node.js `v22.23.2` and pnpm `10.34.7` through `npx` were verified.
  The instance was resized and `free -h` showed 1.9 GiB RAM with no swap.
- The repository is present at
  `/home/ssm-user/baloot/baloot-auth`; Baloot Pay has a separate checkout at
  `/home/ssm-user/baloot/baloot-pay`. Baloot Pay was not inspected or changed.
- RDS is the private PostgreSQL instance `baloot-prod-db`, endpoint
  `baloot-prod-db.c01go0iwm8o7.us-east-1.rds.amazonaws.com:5432`.
- The owner verified a TLS-verified EC2 connection to database `baloot_auth`
  as `baloot_auth_app`. The owner reports that the two committed Auth
  migrations were applied using the master account. The app role was granted
  `USAGE` on `public` and `SELECT`, `INSERT`, `UPDATE` on existing tables.
- The owner confirmed that `baloot_auth_app` can query `public.clients`, and
  that the Safaretail client (`f153de08-c3b7-4584-8cd3-79930003803a`),
  origin `https://safaretail.au`, and built-in `user` and `platform_admin`
  roles exist.
- The app is managed by `baloot-auth.service`, using the external
  `/etc/baloot-auth.env` file. Its configuration file was verified as
  `root:root` mode `0600`. The file contains the runtime database URL,
  distinct signing secrets, email configuration, and production URLs; never
  display or copy its contents into the repository.
- The owner verified the app returns HTTP 200 locally and listens only on
  `127.0.0.1:3000` with `NODE_ENV=production`.
- Caddy `v2.11.7` is installed at `/usr/local/bin/caddy` from its official
  release archive after SHA-512 verification. `caddy.service` serves
  `auth.balootix.com`, proxies to `127.0.0.1:3000`, and hides Swagger routes.
  Caddy obtained a Let's Encrypt certificate with TLS-ALPN validation; the
  owner confirmed `https://auth.balootix.com/` works. The HTTP-01 challenge
  failed because port 80 was unreachable; do not open port 80 as a workaround.
- The application and Caddy configuration were changed manually on EC2.
  The EC2 checkout was previously observed at commit `6823ebd`; the local
  source changes are not yet known to be committed or deployed from a
  reproducible release.

## Important outstanding security and operations work

1. **Rotate the exposed database credential.** The old `baloot_auth_app`
   credential was visible in a chat/IDE selection. Rotation was recommended,
   but completion and propagation to both the EC2 environment file and local
   `.env` have not been verified. Treat the old value as compromised. Do not
   paste it into Git, chat, or terminal command arguments.
2. **Make deployment reproducible.** Commit the production loopback binding
   and corrected `start:prod` output path, then deploy the reviewed commit to
   EC2 rather than relying on manual source edits. Preserve the working
   systemd configuration and environment file.
3. **Review runtime least privilege.** The observed app grants include
   `SELECT`, `INSERT`, and `UPDATE` on existing tables. Review application
   operations and future migration behavior; do not give the app login
   schema-creation or migration privileges. Keep migrations and operator
   seeding under a separate authorized identity.
4. **Use a dedicated service account.** The current unit was created with
   `User=ssm-user`. Plan a reviewed move to a dedicated non-login account,
   ensuring release files remain readable and secrets are still supplied
   through systemd's root-read `EnvironmentFile` mechanism.
5. **Verify public ingress and renewal.** Confirm the security group allows
   only intended public ports (443; keep 3000 closed). Caddy must retain
   access to its persistent data directory so automatic certificate renewal
   continues. Test renewal/boot behavior during a safe maintenance window.
6. **Test the real integration.** Use synthetic accounts to verify
   registration, verification email delivery, login, refresh, logout, and
   password reset. Confirm frontend origin and route configuration with the
   Safaretail owner; do not use real user credentials.
7. **Track shared-resource risk.** Baloot Pay shares the EC2 host and Caddy.
   Before changing instance size, security groups, Caddy, DNS, or services,
   inspect Pay's live configuration and assess downtime and cost.

## Database and migration safeguards

- Auth uses `baloot_auth` and `baloot_auth_app`; do not reuse them for Baloot
  Pay. Never put the RDS master account in an application configuration.
- The Auth schema consists of the committed initial schema migration and
  account/session administration migration. The latter requires
  `refresh_sessions` to be empty before adding its required `session_id`
  column. The owner reports both were applied to production; verify actual
  migration history before any future schema change.
- Do not run `db push`, reset, or unreviewed migrations. Back up and inspect
  the target, check migration status and preconditions, and obtain explicit
  approval for each production schema/data operation.
- The seed command changes data. Its production client/origin and role
  behavior has been run for Safaretail; do not rerun with different inputs
  without reviewing the exact target values first.

## Completion checklist

- [x] Private RDS connection from EC2 verified with TLS as the Auth app user.
- [x] Auth schema and account/session migrations reported applied; app table
      access and startup verified.
- [x] Safaretail client, allowed origin, and built-in roles verified.
- [x] Production service and loopback-only listener verified.
- [x] Public HTTPS endpoint and certificate verified by the owner.
- [ ] Exposed old app database credential rotated and all authorized
      configurations updated.
- [ ] Source-controlled changes deployed to EC2 from a reproducible release.
- [ ] Dedicated non-login service account and boot/renewal behavior reviewed.
- [ ] Synthetic end-to-end auth and email flows tested.
- [ ] EC2 public IP stability and shared Baloot Pay impact documented.
