# Implementation and activation status

## Deployed

- Supabase project: `motuhpcynixmorwolnlv`, Duewell, US East, free-plan organization.
- Five migrations, including `20261122224735_duewell_email_only.sql`.
- All six public tables use RLS. Client mutations use invoker API wrappers with narrow, ownership-checked implementations in the unexposed `duewell_private` schema. Session membership and MFA assurance are enforced in the database.
- Email-only `reminder-worker` version 2 and `account` are active. The older Twilio callback remains deployed but dormant; SMS and push registration/scheduling are blocked.
- Encrypted runtime settings and the authenticated `duewell-reminder-dispatch` Cron job run every minute. The active configuration allowlist excludes SMS and push credentials.
- Frontend public configuration points to the live project. No provider secrets or VAPID identity are required by the browser.
- Resend sending domain `settleupapp.cloud` is verified. The sending-only API key is restricted to that domain and stored in Vault as `duewell_resend_api_key`. The sender is `Duewell <reminders@settleupapp.cloud>`, stored as `duewell_email_from`.

## Verified

36 automated tests, a production build and Deno checks passed locally. GitHub Actions runs the same checks for the branch. Tests cover owner isolation, payment idempotency and overpayment prevention, email scheduling/time zones/opt-out, deferred-channel rejection, server-only settings, Resend request idempotency/privacy, conservative retry behavior and PWA cache boundaries.

Live transactional smoke tests passed against hosted Supabase, including email scheduling, email opt-out, SMS/push rejection, payment protection and cross-account access rejection. All synthetic users, sessions and application rows were rolled back. Security advisors reported no notices. Performance advisors only reported unused indexes on the new database; retain these until real workload data is available ([advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)).

The minute scheduler invokes the updated worker with HTTP 200 and `{accepted:0,skipped:0,failed:0}`. There were no real profiles or pending jobs at the latest verification; the scheduler sent no messages. The worker can read both configured email settings, while anonymous and authenticated clients remain blocked from the delivery-configuration RPC.

Desktop and 390px browser QA confirmed email-only preferences, the verified email destination, reminder timing controls and saving an email reminder using clearly labeled sample data. Earlier QA covered partial payments, month-end schedules, fixed headers and dark theme. Demo checks do not prove inbox delivery.

## Verified email integration

On November 22, 2026 (America/New_York), the owner approved publishing three DNS records in Hostinger, creating the restricted Resend key, storing it in Duewell's Vault, and sending one setup email to the owner-designated test address. Hostinger saved the DKIM TXT record and both sending CNAME records, and Resend confirmed the domain as verified and ready to send.

The single setup email was sent from the backend using the encrypted production credentials and a stable idempotency key. Resend returned HTTP 200 and its email details page reported both `sent` and `delivered`. The API key was transferred directly between the signed-in dashboards, without putting its value in chat, source files or frontend configuration.

This verifies the sending-domain and credential integration. It does not claim an inbox read, completed public onboarding, or a real account's scheduled installment reminder. SMS and push remain intentionally paused.

## Still required before public launch

The frontend has no public HTTPS deployment yet. Vault `APP_URL` points to the local review origin. Set the final origin in Vault, frontend configuration and Supabase Auth. Configure production Auth SMTP, confirmation/reset redirects and password settings, then test real onboarding. Reminder API configuration does not automatically configure Auth SMTP.

The source is published on `codex/duewell-pwa`, with [draft pull request #1](https://github.com/Nyiawungtech/debt-remindeer-app/pull/1) targeting `main`. Keep it a draft until public hosting, Auth configuration and signup-to-scheduled-reminder acceptance are verified. See [deployment steps](DEPLOYMENT.md) for the exact setup.
