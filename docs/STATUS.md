# SettleUp beta delivery status

Updated November 22, 2026 (America/New_York).

## Configured

- Existing repository: Nyiawungtech/debt-remindeer-app, source branch `codex/duewell-pwa`, pull request #1.
- Supabase project `motuhpcynixmorwolnlv`, US East. Six applied migrations, RLS on all six public tables, invoker wrappers and ownership-checked private mutations.
- Worker v4 supports email and Web Push. Five jobs are processed concurrently per minute, with at most three device sends per job at once. SMS remains deferred.
- Stable VAPID identity, restricted Resend key, sender `SettleUp <reminders@settleupapp.cloud>` and canonical app URL stored in encrypted Vault. No server secrets in the frontend or repository.
- Minute scheduler active and returning HTTP 200.
- Resend sending domain verified; the earlier owner-approved setup email was reported delivered by Resend. This does not verify a scheduled account reminder.
- Supabase Auth production URL/redirects, confirmed email and custom Resend SMTP configured. Confirmation email branded SettleUp.
- Hostinger Premium site space created for settleupapp.cloud. Existing unrelated sites were not modified. Support alias `support@settleupapp.cloud` receives into the existing `reminders@settleupapp.cloud` mailbox; no new mailbox purchase.

## Verified

- 42 automated tests pass, including actual PostgreSQL ownership/payment/reminder behavior through PGlite, privacy and provider errors, encrypted VAPID request construction, and service worker URL/cache boundaries.
- TypeScript production build and Deno Edge Function checks pass.
- Hosted transactional smoke checks passed; synthetic users, sessions and financial rows were rolled back.
- Supabase security advisors returned no notices.
- Desktop demo visually inspected. Production build 20743a39b5ede68b prepared with 28 public offline assets, maskable/mobile icons, manifest and Hostinger security headers.

## Final acceptance still pending

- Hostinger Git deployment and live HTTPS/header/PWA checks.
- Owner creates an account and chooses their own password, confirms the email in the same browser, then signs in.
- Real scheduled email and browser push acceptance and owner-observed receipt. iOS Home Screen and Android physical-device checks are not yet performed.
- Public beta is not an independently audited financial service. Payments occur with lenders; Mark as paid only updates the tracker.
