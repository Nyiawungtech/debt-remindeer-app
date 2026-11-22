# Implementation and activation status

## Deployed

- Supabase project: `motuhpcynixmorwolnlv`, Duewell, US East, free-plan organization.
- Five migrations, including `20261122224735_duewell_email_only.sql`.
- All six public tables use RLS. Client mutations use invoker API wrappers with narrow, ownership-checked implementations in the unexposed `duewell_private` schema. Session membership and MFA assurance are enforced in the database.
- Email-only `reminder-worker` version 2 and `account` are active. The older Twilio callback remains deployed but dormant; SMS and push registration/scheduling are blocked.
- Encrypted runtime settings and the authenticated `duewell-reminder-dispatch` Cron job run every minute. The active configuration allowlist excludes SMS and push credentials.
- Frontend public configuration points to the live project. No provider secrets or VAPID identity are required by the browser.

## Verified

36 automated tests, a production build and Deno checks passed locally. GitHub Actions runs the same checks for the branch. Tests cover owner isolation, payment idempotency and overpayment prevention, email scheduling/time zones/opt-out, deferred-channel rejection, server-only settings, Resend request idempotency/privacy, conservative retry behavior and PWA cache boundaries.

Live transactional smoke tests passed against hosted Supabase, including email scheduling, email opt-out, SMS/push rejection, payment protection and cross-account access rejection. All synthetic users, sessions and application rows were rolled back. Security advisors reported no notices. Performance advisors only reported unused indexes on the new database; retain these until real workload data is available ([advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)).

The minute scheduler invoked the updated worker with HTTP 200 and `{accepted:0,skipped:0,failed:0}`. No messages were sent. There were no real profiles or active non-email jobs at verification.

Desktop and 390px browser QA confirmed email-only preferences, the verified email destination, reminder timing controls and saving an email reminder using clearly labeled sample data. Earlier QA covered partial payments, month-end schedules, fixed headers and dark theme. Demo checks do not prove inbox delivery.

## Still required before public launch

The user has created a Resend account. Its sending API key and sender address have not yet been added to Vault (`duewell_resend_api_key`, `duewell_email_from`). Domain verification and actual email receipt remain unverified. Reminder email is not activated; SMS and push are intentionally paused.

The frontend has no public HTTPS deployment yet. Vault `APP_URL` points to the local review origin. Set the final origin in Vault, frontend configuration and Supabase Auth. Configure production Auth SMTP, confirmation/reset redirects and password settings, then test real onboarding. Reminder API configuration does not automatically configure Auth SMTP.

The source is published on `codex/duewell-pwa`, with [draft pull request #1](https://github.com/Nyiawungtech/debt-remindeer-app/pull/1) targeting `main`. Keep it a draft until production activation and actual inbox receipt are verified. See [deployment steps](DEPLOYMENT.md) for the exact setup.
