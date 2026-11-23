# SettleUp

A responsive debt reminder PWA built with **Ionic React, TypeScript, Vite and Supabase PostgreSQL**. The same UI can later be packaged using Capacitor; this milestone focuses on the PWA.

## What works in this codebase

- Sign up, email confirmation, login, password recovery, password changes, optional TOTP MFA, logout, export and account deletion.
- Owner-isolated debts, custom or equal installments, anchored monthly schedules, full/partial payments, reversal history and installment edits.
- Dashboard periods, remaining balance, money-based progress, active/completed debts, search, calendar, and context-aware empty states.
- Email and encrypted Web Push reminders, with per-installment timing, device registration and channel opt-out.
- Server-side scheduling, worker leases, Resend idempotency keys, conservative retries, provider status history, and private reminder content by default.
- Install manifest, generated app icons, service worker, offline fallback, theme settings, fixed header, desktop sidebar and mobile navigation.

Payments happen with the lender. **Mark as paid** only updates the tracker. USD is the initial supported currency. No bank account connection or payment processing is included.

## Run locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Without the public Supabase configuration, the app displays login plus an explicitly labeled, in-memory interactive demo. **The demo does not create accounts, save real data or send reminders.** A successful frontend build is not evidence that any external delivery provider is connected.

For real accounts, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Secret provider credentials belong exclusively in Supabase Vault or Edge Function secrets.

## Verify

```sh
npm test                # Financial rules + actual PostgreSQL/RLS tests through PGlite
npm run build           # Strict TypeScript and production PWA bundle
npm run backend:check   # Deno checks the Edge Functions
```

Node 24 is used in CI. The lockfile pins dependency resolution. Deno is a development dependency for backend checks.

## Connected backend

The Supabase project is `motuhpcynixmorwolnlv` (US East). Its database migrations, three Edge Functions, encrypted runtime settings and minute scheduler are deployed. The client example configuration contains only public keys.

Six migrations and the email/push dispatch worker are deployed. Live transactional checks verified ownership, payment rules, reminder scheduling and opt-out; all synthetic data was rolled back. Security advisors reported no notices. Resend verifies `settleupapp.cloud`; credentials are stored server-side in Vault. Production Auth redirects and custom Resend SMTP are configured. Hostinger deployment is being verified; see the exact acceptance status in [STATUS.md](docs/STATUS.md).

The public beta uses **SettleUp** branding, USD amounts, email plus push reminders, persistent PKCE sessions, public help/privacy/terms, and installable PWA assets. SMS remains deferred. No independent security audit or real-device delivery certification is claimed.

## Connect and ship

Follow [deployment instructions](docs/DEPLOYMENT.md). They cover the database migrations, real authentication, provider accounts, scheduler, HTTPS hosting and end-to-end acceptance. See [security model](docs/SECURITY.md) and [current delivery status](docs/STATUS.md).

Source layout:

| Path                    | Purpose                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `src/App.tsx`           | PWA screens and forms                                                      |
| `src/lib/domain.ts`     | Exact money, dates, periods and financial rules                            |
| `src/lib/workspace.ts`  | Authenticated database actions and isolated sample workspace               |
| `supabase/migrations/`  | Schema, RLS and transactional financial/worker RPCs                        |
| `supabase/functions/`   | Email/push dispatch worker and account deletion (legacy SMS webhook is dormant) |
| `supabase/schedule.sql` | Vault-backed minute scheduler setup                                        |
| `public/sw.js`          | Public asset caching and offline fallback                                  |
| `tests/`                | Behavioral and database security tests                                     |

This implementation has not undergone an independent security audit. Complete the owner signup and device delivery acceptance in STATUS.md before a wider rollout.
