# Implementation and activation status

## Deployed

- Supabase project: `motuhpcynixmorwolnlv`, Duewell, US East, free-plan organization.
- Four migrations: debt/account schema, worker RPCs, delivery protection/indexes, minute scheduler.
- All six public application tables use RLS. Browser mutations use invoker API wrappers with narrow, ownership-checked implementations in the unexposed `duewell_private` schema.
- Existing session membership and MFA assurance are enforced server-side.
- Edge Functions: `reminder-worker`, `twilio-webhook`, `account` (active).
- Encrypted Vault runtime configuration, generated VAPID identity, and an authenticated Cron job.
- Client configuration points to the live project; only public publishable and VAPID keys ship in the frontend.

## Verified

29 automated checks, a production build, and Deno checks passed locally and in GitHub Actions. Live database smoke tests confirmed owner isolation, duplicate-payment protection, overpayment prevention, blocked cross-account mutations, and server-only delivery settings. Every synthetic row was rolled back.

Live HTTP checks rejected anonymous debt reads, unauthenticated worker calls, unsigned Twilio callbacks and account operations without a user token. The server-side scheduler invoked the worker with HTTP 200, with zero accepted/skipped/failed jobs because no users or reminders had been created. Supabase security advisors reported no notices; performance advisors only noted indexes unused on the new, empty database.

Earlier desktop/390px browser QA covered partial payments, email + SMS schedule entry using sample data, month-end installment generation, fixed headers, and dark theme. These browser checks did not send real messages.

## Still required before public launch

The user has not created Twilio or email provider accounts. SMS delivery, phone verification, reminder email and production Auth SMTP are not activated. Email/password signup is enabled in Supabase and email confirmation is required, but public email onboarding/redirects/password settings still need production configuration and verification. No real signup or actual push/SMS/email receipt is claimed.

The application has no public HTTPS frontend deployment yet. Vault `APP_URL` currently points to the local review origin. Update it and Supabase Auth URLs to the final frontend origin before public use. Keep the VAPID identity stable when deploying; its private key stays in Vault.

GitHub access is working. The complete application source is published on `codex/duewell-pwa`, with draft pull request https://github.com/Nyiawungtech/debt-remindeer-app/pull/1 targeting `main`. It remains a draft pending the production activation steps above.
