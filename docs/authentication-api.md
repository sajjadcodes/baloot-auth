# Authentication API

The service documents its REST API in Swagger/OpenAPI at `/api/docs` while it
is running. Successful responses use the standard response envelope; errors
return a safe message and status code.

## Endpoint overview

| Method   | Endpoint                                        | Purpose                                                                   |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| `POST`   | `/auth/register`                                | Register an account and send a verification email.                        |
| `POST`   | `/auth/verify-email`                            | Verify an email address using a signed token.                             |
| `POST`   | `/auth/resend-verification`                     | Request another verification email without revealing account eligibility. |
| `POST`   | `/auth/login`                                   | Authenticate and set HttpOnly authentication cookies.                     |
| `POST`   | `/auth/refresh`                                 | Rotate the refresh token and set updated cookies.                         |
| `POST`   | `/auth/logout`                                  | Revoke the session and clear authentication cookies.                      |
| `GET`    | `/auth/me`                                      | Return the authenticated user's public information.                       |
| `POST`   | `/auth/forgot-password`                         | Request a password-reset email.                                           |
| `POST`   | `/auth/reset-password`                          | Set a new password with a signed reset token.                             |
| `GET`    | `/auth/admin/users/:userId`                     | Inspect a same-client user account (`platform_admin`).                    |
| `GET`    | `/auth/admin/users/:userId/sessions`            | List active session metadata (`platform_admin`).                          |
| `PATCH`  | `/auth/admin/users/:userId/disable`             | Disable a same-client user and revoke all sessions (`platform_admin`).    |
| `PATCH`  | `/auth/admin/users/:userId/enable`              | Re-enable a same-client user (`platform_admin`).                          |
| `DELETE` | `/auth/admin/users/:userId/sessions/:sessionId` | Revoke one session (`platform_admin`).                                    |

Swagger contains the current DTO validation rules, headers, and endpoint
details.

## Client and origin headers

Auth requests are scoped to an active registered client using the public
`X-Client-Id` UUID. State-changing browser requests also require an `Origin`
that is configured in global `CORS_ORIGINS` and assigned to that client in
`client_allowed_origins`. The header and origin are not authentication
credentials; non-browser callers can supply them.

Clients must be provisioned through trusted configuration and the seed or an
approved administrative process. Public registration cannot create clients
or choose client IDs.

## Registration and email verification

`POST /auth/register` accepts `email` and `password`. Email is normalized to
lowercase; passwords must be 12–128 characters. Email uniqueness is per
client. Registration assigns the `user` role server-side, stores an Argon2id
hash, and sends a short-lived signed verification link. It does not establish
an authenticated session. Registration is rate-limited.

Verification tokens are signed with `EMAIL_VERIFICATION_SECRET`, identify the
user, client, email, and purpose, and are not stored in the database. The
frontend should read the token from the URL fragment, POST it to
`/auth/verify-email` with the same client ID, and remove it from the address
bar. Verification is single-use. If an email does not arrive, call
`POST /auth/resend-verification`; the response does not disclose account
eligibility.

## Browser login and refresh

Only a successful login for an active, verified user sets the access and
refresh tokens as HttpOnly cookies. Frontend JavaScript must not read or store
authentication tokens. For cross-origin requests, configure the HTTP client
to include credentials and let the browser send cookies and the `Origin`
header.

Login credentials are checked within the selected client. Invalid credentials,
disabled accounts, and unverified accounts receive the same generic error.
Successful login creates a session with a hashed refresh token. The access
cookie uses `/`; the refresh cookie is scoped to `/auth`. Cookies are
host-only and follow the configured SameSite and expiry policies; production
cookies are Secure.

`POST /auth/refresh` rotates the hashed refresh token atomically within the
same auth session. Reuse of a revoked refresh token revokes the user's other
active sessions. The endpoint does not return token values in the response
body.

`POST /auth/logout` is idempotent if the refresh cookie is missing, invalid,
or already revoked. A valid cookie for the requested client revokes its auth
session immediately and clears both cookies.

`GET /auth/me` returns only the authenticated user's ID and email. Swagger is
configured to send browser cookies; use the login operation in Swagger before
calling protected routes.

## Password reset

Configure `PASSWORD_RESET_SECRET`, distinct from
`JWT_ACCESS_SECRET` and `EMAIL_VERIFICATION_SECRET`, and set the reset URL.
`POST /auth/forgot-password` returns the same response whether or not an
eligible account exists. If eligible, the user receives a short-lived reset
link.

The frontend reads the token from the URL fragment, removes it from the
address bar, and posts it with the new password (12–128 characters) to
`POST /auth/reset-password`. The token is bound to the current password hash;
the password update and revocation of all auth sessions happen in one
transaction. Session-bound access tokens are invalidated immediately.

## Client origins

To add an origin, add its exact scheme, hostname, and optional port to
`CORS_ORIGINS` and to that client's origins in `SEED_CLIENTS_JSON`, then run
`pnpm db:seed` against the intended database and restart/redeploy the service.
Do not create another client just to add a frontend origin. See
[Getting started](./getting-started.md) for setup and
[Security](./security.md) for origin and cookie requirements.
