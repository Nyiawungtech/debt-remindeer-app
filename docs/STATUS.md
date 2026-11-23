# SettleUp public beta delivery status

Updated November 23, 2026 (America/New_York).

## Live deployment

- Public app: https://settleupapp.cloud/ on the existing Hostinger Premium plan. Git deployment reports completed.
- Connected repository: Nyiawungtech/debt-remindeer-app, selected repository only. Hostinger’s required administration/code/pull-request write permissions were explicitly approved by the owner.
- Static deployment branch: `release/hostinger`, release commit `571de2b92d0f201687b37393480ee4c3db2d2b3c`, build `04f104d6895df145`, version `0.2.0-beta`. The 49-file release tree was verified against the local build before publishing; prior hashed assets remain available for open sessions.
- Source branch: `codex/duewell-pwa`, draft pull request #1. Keep the acceptance limits below visible before wider promotion.
- Support: `support@settleupapp.cloud` is an active alias of the existing `reminders@settleupapp.cloud` mailbox. No new mailbox purchase was needed. Unrelated hosted websites were not modified.

## Backend and authentication

- Supabase `motuhpcynixmorwolnlv`, US East: six applied migrations, RLS on all six public tables, invoker API wrappers and narrow ownership-checked implementations.
- Worker v5 handles email and Web Push. Five jobs are processed concurrently per invocation, at most three device sends per job at once, with minute scheduling and conservative retries. SMS remains deferred.
- Stable VAPID identity, restricted Resend key, sender `SettleUp <reminders@settleupapp.cloud>` and canonical app URL are stored in encrypted Vault. No server secrets are in the frontend or source repository.
- Production Auth URL/redirects and custom Resend SMTP are configured. Confirmed email, a visually verified 12-character minimum password, secure email/password changes and optional TOTP protect accounts. Password/email changes and MFA enrollment/removal trigger security emails.
- Confirmation and recovery messages use SettleUp branding. PKCE links must be opened in the browser that requested them.
- Resend previously reported the owner-approved setup email as delivered. This verifies the sending integration, not a real account’s scheduled reminder or inbox read.

## Verified

- 51 automated tests pass: PostgreSQL ownership and money invariants through PGlite, reminder channels/opt-out, provider errors/privacy, encrypted VAPID request construction, pagination and service-worker cache/URL boundaries.
- TypeScript/Vite production build and Deno checks pass. GitHub Actions passed on the published source. Live transactional checks passed with all synthetic account/financial data rolled back. Supabase security advisors reported no notices.
- Live HTTPS root returns 200. HTTP and www redirect to the canonical HTTPS origin. CSP, HSTS, nosniff, manifest MIME and no-cache HTML/manifest/service-worker headers were confirmed. Service-Worker-Allowed is `/`.
- Live release.json and service-worker cache version match the tested build. All 28 precache assets returned 200; PNG dimensions were correct for 192, 512, maskable and Apple touch icons.
- Server HEAD requests to `/.git/HEAD` and `/.env` return 403.
- Browser sample flow: added $200 as four $50 installments; recorded $25; verified $175 remaining and updated progress; scheduled a future sample reminder. The demo clearly says no messages are sent and uses in-memory records.
- Fixed header confirmed during scrolling. Compact responsive layout and mobile navigation visually checked at about 449 CSS pixels using browser zoom. Public help/privacy/terms pages render and show the support address.

## UI motion update

- Added staggered page/card entrances, animated progress fills, tactile button and navigation feedback, spring-style dialogs, toast entrances and gentle auth-page motion. Existing layout and financial behavior are unchanged.
- Motion is enabled only when the device has not requested reduced motion. Keyboard focus cancels card entrances immediately. No new dependencies were added; the compressed CSS increase is about 1.4 KB.
- Production build and both GitHub Actions runs passed on source commit `aed958e51e8e67cbf5e19741fe38169115788566`. Preview payment dialog opening, Escape dismissal and focus restoration were checked. The live release manifest and new CSS were verified after automatic Hostinger deployment.

## Mobile date and clean URL update

- Mobile installment rows now give the date a full-width labeled field, retain 16px input text and provide a 44px remove control. Tapping anywhere in a date input opens the native picker when supported; native keyboard/picker fallback remains available.
- App navigation uses history paths such as `/add`, `/debts` and `/debt/<id>`. Old hash bookmarks migrate in place without dropping PKCE query parameters. Auth fragments and the accessibility anchor are preserved. Public policy links, PWA shortcuts, email links and notification destinations use clean paths. The worker continues accepting old notification destinations safely.
- Source commit `23db89dee4e60169f7729df2f61f0468b3588d4a` passed both GitHub Actions runs. All 47 local tests, the production build and Deno checks passed. Browser checks covered date selection and saving a generated $200 sample schedule, Back/Forward navigation and policy links without losing demo state. No real financial records were created.
- Live `/add`, `/debts` and `/privacy` return the new app bundle with no-cache and CSP headers. The release manifest matches build `04f104d6895df145`; shortcuts use clean paths. Worker v5 was retrieved after deployment and all files matched the intended release, with its existing authentication unchanged.
- Owner signup visibility and the proposed Capacitor milestone are documented in `docs/ADMIN_AND_MOBILE.md`. No in-app administrator role or native mobile project was added.

## Confirmation screen and iPhone spacing update

- Successful signup without a session opens the dedicated `/confirm-email` screen, clears the password field and moves focus to the confirmation heading. It offers resend with a 60-second cooldown, another email and return-to-sign-in controls. No confirmation emails are sent automatically by opening this page.
- Only a pending email address and send time are kept in session storage, for at most two hours when read; passwords and auth tokens are never stored there. Blocked storage keeps the in-memory flow usable. A confirmed session returns to the dashboard.
- Native date inputs now have zero inline padding, with the border and spacing on a surrounding control. This addresses the iPhone-only percentage-width padding defect documented at https://bugs.webkit.org/show_bug.cgi?id=301648. Card spacing is 24px; mobile basic fields stack, and installment generation buttons and summary/action rows can wrap.
- All 51 local tests and the production build passed. Preview checks verified the standalone confirmation screen, return to sign in, the visible card gap, and native date selection at a narrow browser width. No new real account or email delivery was exercised, and actual iPhone acceptance remains pending.
- The workspace disconnected during artifact upload. GitHub's read-only runner rebuilt the same `04f104d6895df145` release with the committed public frontend configuration; its tests, build and Deno checks passed. The recovered release tree was verified across all 49 files before publishing. The temporary payload-log export was removed after recovery. CI keeps the public build configuration step.
- The frontend is published on `release/hostinger` at `571de2b92d0f201687b37393480ee4c3db2d2b3c`. Reminder worker v5 and database/security settings were unchanged.

## Acceptance still pending

- Owner signup, confirmation and password recovery using the production app and the owner’s chosen credentials.
- A real scheduled email and Web Push message, provider acceptance and owner-observed receipt. No actual device receipt is claimed yet.
- Installed iOS Home Screen and Android physical-device checks. Narrow browser rendering is not physical-device acceptance.
- A live offline reload/install check: this cloud browser blocks developer tools, so no bypass was attempted. Automated service-worker behavior and public assets were verified; financial records require internet and are not cached.
- This is a public beta, not an independently audited financial service. Payments occur with lenders; Mark as paid only updates the tracker.
