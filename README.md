# Duewell

A responsive debt reminder PWA built with **Ionic React, TypeScript, Vite and Supabase PostgreSQL**. The same UI can later be packaged using Capacitor; this milestone focuses on the PWA.

## What works in this codebase

- Sign up, email confirmation, login, password recovery, password changes, optional TOTP MFA, logout, export and account deletion.
- Owner-isolated debts, custom or equal installments, anchored monthly schedules, full/partial payments, reversal history and installment edits.
- Dashboard periods, remaining balance, money-based progress, active/completed debts, search, calendar, and context-aware empty states.
- Email-only reminders to the verified account address, with per-installment timing and account-wide opt-out.
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

The Duewell Supabase project is `motuhpcynixmorwolnlv` (US East). Its database migrations, three Edge Functions, encrypted runtime settings and minute scheduler are deployed. The client example configuration contains only public keys.

A live transactional smoke test verified owner isolation, payment idempotency, overpayment prevention and server-only access to delivery configuration; synthetic records were rolled back. The scheduler successfully invoked the worker with HTTP 200 and no messages sent. Public Auth settings, Resend sending credentials, frontend HTTPS hosting and actual inbox receipt still need activation/acceptance. SMS and push reminders are paused in both the UI and backend.

## Connect and ship

Follow [deployment instructions](docs/DEPLOYMENT.md). They cover the database migrations, real authentication, provider accounts, scheduler, HTTPS hosting and end-to-end acceptance. See [security model](docs/SECURITY.md) and [current delivery status](docs/STATUS.md).

Source layout:

| Path                    | Purpose                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `src/App.tsx`           | PWA screens and forms                                                      |
| `src/lib/domain.ts`     | Exact money, dates, periods and financial rules                            |
| `src/lib/workspace.ts`  | Authenticated database actions and isolated sample workspace               |
| `supabase/migrations/`  | Schema, RLS and transactional financial/worker RPCs                        |
| `supabase/functions/`   | Email dispatch worker and account deletion (legacy SMS webhook is dormant) |
| `supabase/schedule.sql` | Vault-backed minute scheduler setup                                        |
| `public/sw.js`          | Public asset caching and offline fallback                                  |
| `tests/`                | Behavioral and database security tests                                     |

This implementation has not undergone an independent security audit. Production delivery must be verified with your actual Supabase, email and hosting configuration before inviting public users.
