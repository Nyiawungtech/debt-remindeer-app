# Deploy SettleUp on Hostinger

Use the existing Supabase project `motuhpcynixmorwolnlv` and the existing Hostinger Premium site for `settleupapp.cloud`. No Supabase database is hosted in Hostinger MySQL.

## Build

Copy public configuration from `.env.example` to `.env.local`, then run `npm ci`, `npm test`, `npm run build` and `npm run backend:check`. Only the Supabase URL/publishable key, VAPID public key and canonical app URL belong in a Vite environment file. Server keys stay in Vault.

The build writes `dist/`, injects exact hashed public assets into the service worker, assigns a content-based cache version and produces `release.json`. Deploy the contents of dist at the website root, including `.htaccess`. Preserve previous release files for rollback; do not expose source env files or test pages.

The `release/hostinger` branch contains only the built static release at its root. Hostinger’s built-in Git deployment can pull it without accessing local browser files. Keep source development on `codex/duewell-pwa` until reviewed and merged.

## Backend and Auth

Six SQL migrations are applied, including `20261123004952_settleup_push_launch.sql`. Generate later migrations with `supabase migration new`, test locally, then apply to the hosted project and retain the hosted migration timestamp in source.

The worker deployment includes the `_shared/common.ts`, `keys.ts`, `email.ts` and `push.ts` dependencies and pins web-push 4.0.0. `verify_jwt=false` is intentional for the worker: it requires a constant-time checked private `x-worker-secret` instead. Account deletion validates its own user JWT, password and MFA. The legacy SMS callback remains dormant.

Vault settings: `duewell_app_url`, `duewell_worker_url`, `duewell_worker_secret`, `duewell_resend_api_key`, `duewell_email_from`, `duewell_vapid_subject`, `duewell_vapid_public_key`, `duewell_vapid_private_key`. Retain the stable VAPID identity to preserve existing subscriptions. Internal legacy names do not affect public branding. Runtime settings may be cached for 60 seconds.

Supabase Auth Site URL is `https://settleupapp.cloud`, with exact canonical redirect URLs. Use the same browser for signup/password-reset links because PKCE’s verifier is local to that browser. Custom SMTP: smtp.resend.com, port 465, user resend, existing restricted Resend API key as password, sender reminders@settleupapp.cloud, name SettleUp. Keep `.ConfirmationURL` in email templates; never put the key in source.

Email confirmation, 12-character minimum passwords and secure email changes are enabled. Optional TOTP is available in the app and required at the database layer once verified. Provider plan quotas and Auth rate limits still apply; monitor them before wider promotion. Do not purchase upgrades automatically.

## DNS and support

Hostinger hosts the apex and www site. Preserve the existing Resend DKIM TXT plus rsend/send CNAMEs, Hostinger mailbox MX/SPF/DKIM, autodiscover and DMARC records. `support@settleupapp.cloud` is an alias of the existing reminders mailbox.

## Release acceptance

Verify HTTPS and canonical redirects, manifest MIME/icons, no-cache service worker and HTML, CSP/HSTS headers, and the release build ID. Test desktop/mobile layouts, demo debt creation/partial payment/reminders, public policies, offline public shell, and update handling. Authenticated API responses must never be cached.

The owner must complete signup/confirmation and real device permission with their own credentials. Then verify debt persistence, password recovery, one scheduled email and one push message. “Accepted” means the provider accepted the request; it is not a read receipt. Check iOS Home Screen and Android on actual devices before claiming physical-device acceptance.
