# Login and administrator dashboard

Start the application with `npm run backend` and `npm run dev`. Restart an already-running backend after this update. `/tracer.html`, `/builder.html`, `/index.html`, and `/admin.html` require sign-in. A fresh browser tab asks for sign-in; moving between pages in an authenticated tab keeps the session. Sign out is in the Account menu at the bottom right. The backend also checks sessions on scanner APIs and checks administrator roles on admin/training APIs.

## Create your administrator

Run `npm run admin:setup` in the project terminal. Enter your email, name and a password of 12–128 characters. Password input is hidden. Then sign in at `http://localhost:5173/login.html` and choose **Account → Admin dashboard**, or open `/admin.html`.

If the email already has an account, use `npm run admin:setup -- --promote --email you@example.com`. This also works for an existing Google account. Only the trusted server terminal can grant administrator access. Public registration always creates a regular user; the first public signup does not become an administrator.

The dashboard reports registered users, unique active users in the last five minutes, unique users active in the last 24 hours, total successful sign-ins (including registration), seven days of daily active users (UTC), and a paginated user list. Administrators are included. A visible application page sends a heartbeat every minute. These numbers measure recent authenticated page activity, not exact time spent working. Logging out revokes that session immediately.

## Enable Google sign-in

Email/password works without a Google account configuration. The Google button stays disabled with an explanation until configured.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), configure the OAuth consent screen and create an **OAuth client ID → Web application**.
2. Add `http://localhost:5173` under **Authorized JavaScript origins**. Use your exact HTTPS site origin when deployed. Configure test users if the consent screen is in testing mode.
3. Put `GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com` in `apps/backend/.env`. See `apps/backend/.env.auth.example`. This flow does not need a client secret.
4. Install `.venv311/bin/python -m pip install -r apps/backend/requirements-auth.txt` and restart the backend.

The server uses Google's library to validate signature, issuer, audience and expiry, checks verified email, and consumes a one-use nonce bound to an HttpOnly cookie. See [Google's server verification guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token). Existing password accounts are not automatically linked by email: sign in with the password for those accounts.

## Storage and sessions

Accounts, salted PBKDF2-SHA256 password hashes, hashed session tokens and aggregate activity are stored in `apps/backend/private/accounts.sqlite3` (gitignored, mode 0600). Back up this database for account continuity. Configure `AUTH_DB_PATH` to move it. Session cookies are HttpOnly, SameSite=Lax, and Secure when `APP_ORIGIN` is HTTPS. Sessions expire after 30 minutes without a heartbeat or after 12 hours absolutely. The backend rate-limits sign-in attempts and checks the exact Origin and JSON content type on mutations. Never expose a development server publicly; serve only `apps/frontend/dist` and proxy `/api` to the backend on the same HTTPS origin in production. Set `APP_ORIGIN` to that origin. The Vite dev server denies access to the private account database and environment files.

Plans remain stored locally, in a separate browser-storage namespace for each account. They are not cloud-synced or encrypted from someone with access to the browser profile. The first administrator to sign in on an existing device inherits its pre-login plans; originals remain as a recovery copy. Regular users cannot see those plans through the app. Downloaded backups remain ordinary files. The 3D viewer's bundled example plan remains a shared sample.

This version does not send verification or password-reset emails. For an account that needs a password reset, an operator must implement an appropriate verified recovery flow before offering self-service recovery. A local-only account server is available with `npm run auth:server` when the ML scanner is not needed; it uses port 5050 instead of the full backend, not alongside it.

## Checks

`.venv311/bin/python -m unittest discover -s apps/backend/tests -p test_auth.py`

`node --test apps/frontend/tests/accountStorage.test.js apps/frontend/tests/projectFiles.test.js apps/frontend/tests/saved2DPlans.test.js apps/frontend/tests/planBuilder.test.js`

`node scripts/check-auth.mjs` (isolated database, Chrome profile and test servers; never reads real account records)

`npm run build`
