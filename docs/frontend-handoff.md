# Next.js frontend handoff

This guide describes how a Next.js application should integrate with reusable
Baloot Auth through the ecommerce application's NestJS API gateway (for
example, `store-api-gateway`). This gateway is application-specific, not a
reusable `baloot-*` service. The frontend must not call the Baloot Auth
service directly in production.

This document is the frontend-to-gateway auth integration contract. The
gateway should implement this contract; building the gateway does not by
itself require frontend changes. The [authentication API](./authentication-api.md)
defines endpoint behavior, and the [infrastructure guide](./infrastructure.md)
defines the planned deployment topology. Example domains are placeholders.
Update this handoff only when the intended browser-facing contract changes,
not merely when gateway internals or deployment configuration change.

## Request path

```text
Browser
  ├── https://app.example.com ──> Vercel (Next.js)
  └── https://api.example.com ──> Render (Nginx
                                    -> NestJS API gateway
                                    -> Baloot Auth
                                    -> Neon PostgreSQL)
```

The Next.js frontend is hosted on Vercel. Render exposes the public API through
Nginx and the NestJS gateway; the browser must not call Baloot Auth directly.
Prefer custom domains under the same site, such as `app.example.com` for
Vercel and `api.example.com` for the Render/Nginx endpoint. The browser calls
`https://api.example.com/auth/...`; Nginx routes `/auth/*` to the gateway,
which forwards the same path and method to Baloot Auth. Keep that path
unchanged because the refresh cookie is scoped to `Path=/auth`.

The gateway can be a backend-for-frontend boundary: it supplies the
configured `X-Client-Id`, forwards the browser's `Origin` and `Cookie`
headers, and relays the upstream response. The gateway must not allow the
caller to select an arbitrary client ID. For one frontend/client, configure
the trusted client UUID on the gateway; for multiple clients, map the trusted
application to an approved client ID server-side.

Only Nginx should be publicly reachable. Keep the gateway and Baloot Auth on
the intended private service network, and do not expose Neon credentials or
database connectivity to the browser or Next.js client bundle.

## Proxy contract

The gateway and Nginx must preserve the auth request/response semantics:

- Forward HTTP method, `/auth/...` path, query string, request body, and
  content type without changing auth payloads.
- Forward the browser's `Origin` header unchanged. Baloot Auth checks the
  exact public origin against both `CORS_ORIGINS` and the selected client's
  allowed origins.
- Send the configured `X-Client-Id` header to Baloot Auth. It is an
  identifier, not a secret or proof of authorization.
- Forward the incoming `Cookie` header to Baloot Auth.
- Relay every upstream `Set-Cookie` header separately and unchanged. Do not
  combine multiple `Set-Cookie` values into one comma-separated header, drop
  them, or rewrite their `Path`, `SameSite`, `Secure`, or `HttpOnly`
  attributes.
- Preserve the upstream status code, response body, and relevant headers.
  Do not convert an auth error into a successful response.
- Avoid automatic retries for login, refresh, logout, and other auth
  mutations. In particular, serialize refresh attempts: reuse of a rotated
  refresh token can revoke the user's active sessions.

Configure the exact Vercel production origin in both the Baloot Auth
`CORS_ORIGINS` value and the registered client's origin list. The API and
frontend are separate origins, so browser requests must use
`credentials: 'include'` and the API must allow that exact origin with
credentials. Cookies remain host-only to `api.example.com`; the browser sends
them to the API but frontend JavaScript cannot read them.

Use a custom API domain under the same site as the Vercel custom domain.
Cookies can then use the service's `SameSite=Lax` setting while remaining
cross-origin; `credentials: 'include'` is still required. If the frontend
uses a `*.vercel.app` hostname and the API is on an unrelated site, configure
`SameSite=None; Secure`; browser third-party-cookie restrictions may still
block authentication. Prefer a production custom domain and test in supported
browsers. Do not rely on arbitrary Vercel preview URLs as trusted origins;
each approved origin must be configured exactly.

## Next.js request example

Browser components call the public API domain through Nginx and the gateway.
The browser sends the `Origin` header and manages HttpOnly cookies; do not
set `Cookie` or `Origin` manually from browser JavaScript.

```ts
const response = await fetch(
  `${process.env.NEXT_PUBLIC_BALOOT_AUTH_API_URL}/auth/login`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  },
);

const result = await response.json();
if (!response.ok || !result.success) {
  throw new Error(result.message ?? 'Login failed');
}

const user = result.data;
```

Set `NEXT_PUBLIC_BALOOT_AUTH_API_URL` to the public API origin, for example
`https://api.example.com`; it is not a secret. The gateway injects the
configured `X-Client-Id`; the browser does not need to supply it. If the
frontend does send the public client ID, the gateway must validate it against
its trusted mapping rather than accept arbitrary values.

For Next.js Server Components, Route Handlers, or Server Actions that call
the gateway server-to-server, forward the incoming request's `Cookie` and
original `Origin` where applicable. When returning a login, refresh, or
logout response to the browser, relay all `Set-Cookie` headers separately.
Do not assume a server-side `fetch` automatically transfers cookies to the
browser.

## Authentication flow

1. **Register:** `POST /auth/register` with `{ "email", "password" }`.
   Passwords must be 12–128 characters. Registration sends an email and does
   not sign the user in.
2. **Verify:** Read the token from the email verification URL fragment,
   remove it from the visible address bar, and submit
   `POST /auth/verify-email` with `{ "token" }`.
3. **Log in:** `POST /auth/login` with `{ "email", "password" }`. A
   successful response sets HttpOnly access and refresh cookies. The body
   contains public user information, not token values.
4. **Load the current user:** `GET /auth/me`. The browser sends the access
   cookie automatically. The response provides the user's `id` and `email`.
5. **Refresh when needed:** On an authentication `401`, call
   `POST /auth/refresh` once; if successful, retry the original request once.
   Coordinate refresh so simultaneous requests do not rotate the same cookie
   more than once. If refresh fails, clear frontend in-memory user state and
   send the user to login.
6. **Log out:** `POST /auth/logout`. The service revokes the session and
   clears both cookies.

Do not store tokens in React state, browser storage, URLs, or logs. Do not
inspect an access or refresh cookie in frontend JavaScript; both are
HttpOnly.

The API wraps successful results in an envelope:

```json
{
  "success": true,
  "code": 200,
  "message": "Successful request!",
  "data": {}
}
```

Use `data` for the endpoint result and check the HTTP status as well as the
envelope. Error responses are not successful envelopes.

## Password and verification links

Configure `EMAIL_VERIFICATION_URL` and `PASSWORD_RESET_URL` in the Baloot Auth
service to point to HTTPS pages in the Next.js application. Tokens are
included in URL fragments so they are not sent in the initial HTTP request.
The frontend page should read the fragment token, remove it from the address
bar promptly, and send it to the matching API endpoint through the gateway.
Never log or analytics-track the token.

- Verification: `POST /auth/verify-email` with `{ "token" }`.
- Resend: `POST /auth/resend-verification` with `{ "email" }`.
- Request reset: `POST /auth/forgot-password` with `{ "email" }`.
- Complete reset: `POST /auth/reset-password` with `{ "token", "password" }`.

The resend and forgot-password responses intentionally do not disclose
whether an account exists.

## Client configuration and roles

Provision one stable Baloot Auth client for the application. Add the exact
public origin, including scheme and non-default port, to both
`CORS_ORIGINS` and that client's `client_allowed_origins` records. For
example, `https://app.example.com` is an origin; a path such as
`https://app.example.com/auth` is not.

`GET /auth/me` returns only `id` and `email`; it does not return role
assignments. Do not infer authorization from frontend state or a client
controlled role flag. Protected backend operations must be authorized by
Baloot Auth or the consuming backend. Admin endpoints require a valid
`platform_admin` session and enforce same-client access server-side.

## Deployment checklist

- [ ] Vercel serves the frontend on a stable HTTPS custom domain.
- [ ] Render/Nginx exposes the API on a custom HTTPS domain and routes
      `/auth/*` to the gateway without changing the path or cookie headers.
- [ ] The gateway forwards `Origin`, `Cookie`, and the approved
      `X-Client-Id`, and relays each `Set-Cookie` header.
- [ ] Next.js calls the public API domain with `credentials: 'include'` and
      never calls the private Baloot Auth URL from browser code.
- [ ] The exact public frontend origin is configured in Baloot Auth globally
      and for the registered client.
- [ ] Verification and reset email URLs point to the deployed Next.js pages.
- [ ] Login, refresh, logout, verification, and password reset work through
      the public Nginx URL with synthetic accounts.
- [ ] A refresh cookie is present on `/auth/refresh`, and both cookies clear
      on `/auth/logout`.
