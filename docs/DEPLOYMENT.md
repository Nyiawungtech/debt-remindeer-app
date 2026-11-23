# Deployment

## Existing hosted project

Use the existing Duewell project `motuhpcynixmorwolnlv` in US East. Its database migrations, runtime configuration and minute scheduler are deployed. The email-only migration preserves historical data, cancels queued non-email jobs and rejects SMS/push registration or scheduling. The previously deployed Twilio callback is dormant and not part of this release.

Local migration filenames match the hosted history. With CLI v3, inspect `--help` and select the remote target explicitly for hosted changes; CLI authentication is separate from the ChatGPT Supabase connection.

## 1. Authentication

Set Supabase Auth Site URL to the final HTTPS PWA origin and allow that exact origin for redirects. Require email confirmation, at least 12-character passwords and secure email changes. Configure appropriate signup and password reset rate limits. Enable TOTP factors.

Configure production Auth SMTP separately from reminder delivery. Resend can supply SMTP credentials for confirmation and password reset mail, but entering its API key in the reminder worker does not configure Supabase Auth SMTP. Default development Auth email is not the public onboarding service. Phone login and a phone SMS provider are not needed.

## 2. Resend email

The existing integration is configured: `settleupapp.cloud` is verified, the sender is `Duewell <reminders@settleupapp.cloud>`, and the domain-restricted sending key is stored in encrypted Vault settings. One owner-approved setup email was reported delivered by Resend. Keep the current key when deploying the frontend; use the following steps for a fresh setup or intentional credential rotation.

1. Add your sending domain in Resend and publish its required DNS records. Wait for domain verification.
2. Create an API key with permission to send email from that domain.
3. Choose a sender, such as `Duewell <reminders@your-domain.com>`.
4. In [Duewell Supabase Vault](https://supabase.com/dashboard/project/motuhpcynixmorwolnlv/integrations/vault/overview), create these encrypted secrets:

| Vault secret             | Value                                               |
| ------------------------ | --------------------------------------------------- |
| `duewell_resend_api_key` | Resend sending API key                              |
| `duewell_email_from`     | Sender address on your verified domain              |
| `duewell_app_url`        | Final HTTPS frontend origin (update existing entry) |

Enter secret values directly in Supabase. Do not put them in chat, source files or frontend environment variables. Resend's default test sender cannot send to arbitrary public signups; use your verified domain before inviting users. Check the provider's current sending limits and billing for the expected volume.

Reminders go only to the account's confirmed email address. The form does not accept an arbitrary recipient. Users can disable email reminders in Settings; this cancels their pending emails. Changing the account time zone cancels pending schedules so users can set new times deliberately.

## 3. Backend functions and runtime settings

The backend reads allowlisted encrypted Vault entries through a service-role-only RPC. Optional Edge Function environment settings take precedence. Active delivery settings are `APP_URL`, `WORKER_SECRET`, `RESEND_API_KEY` and `EMAIL_FROM`. The generated worker secret already exists: do not rotate it for this change.

When making later backend changes, deploy `reminder-worker` and `account` with their shared files. See `supabase/functions/.env.example` for optional server environment names. Functions authenticate their own requests: the scheduler secret for the worker, and a validated user session, current password and MFA assurance for deletion. Their gateway JWT switch is disabled to support modern Supabase keys.

For a fresh project, apply all migrations in order. Seed the named Vault runtime entries before the platform-specific scheduler migration. Supabase supplies the `auth` schema and platform roles. PGlite's Auth fixtures are for local tests only.

## 4. Scheduler

Vault already contains `duewell_worker_url` and `duewell_worker_secret`. The named Cron job `duewell-reminder-dispatch` runs every minute. `supabase/schedule.sql` documents its setup. Verify both Cron state and `net.http_post` responses.

The database clock schedules email even with the browser closed. Jobs older than 24 hours are skipped. Before sending, the worker rechecks email preference, confirmed contact and remaining balance. Confirmed provider 429 responses are retried with backoff. Timeouts and crashes have uncertain results and are not automatically resent. Resend requests use a stable reminder idempotency key. “Accepted by provider” does not mean inbox delivery or that a message was read.

## 5. PWA hosting

Set public frontend values from `.env.example`, then build with `npm run build`. Host `dist/` over HTTPS. Update `duewell_app_url`, `VITE_APP_URL` and Auth URLs to the same final origin. A Netlify manifest and static `_headers` are included; other hosts need equivalent security headers and HTML/service-worker revalidation.

Only public static assets and the offline page are cached. Never cache Supabase responses in a CDN or service worker. Existing browser push subscriptions are retired when the updated service worker activates. PWA installation, offline fallback and updates remain available without notification permission.

For a Supabase custom domain, update CSP `connect-src` explicitly. All fonts ship with the bundle. No Resend, service-role or scheduler secret belongs in `VITE_` variables: those are public bundle contents.

## 6. Real-service acceptance before launch

Use dedicated accounts and email addresses you control:

1. Sign up and confirm two accounts, test reset mail and redirects, and confirm account isolation through direct REST/RPC calls.
2. Create a $200 debt with four $50 installments; record $20 and then $30. Balance becomes $150 and the first installment's reminders cancel. Reverse $30: balance becomes $180, while old reminders remain cancelled.
3. Schedule an email a few minutes ahead, close the app and confirm actual inbox receipt. Check the recipient, privacy choice, debt/settings links and provider acceptance state.
4. Test email opt-out, time-zone changes, already paid installments, unconfirmed email, rate limits, missing provider configuration and expired worker leases. Direct SMS/push RPC attempts must fail.
5. Enable TOTP and verify that reads and writes remain blocked until MFA is complete. Test account deletion with disposable data.
6. Check HTTPS headers, installability, service-worker updates, offline fallback, fixed headers and responsive screens on target devices.

Automated tests cover database behavior and mocked provider requests. They do not prove inbox receipt or installed-device behavior. Record real-service acceptance before public invitations.
