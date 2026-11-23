# SettleUp public beta delivery status

Updated November 22, 2026 (America/New_York).

## Live deployment

- Public app: https://settleupapp.cloud/ on the existing Hostinger Premium plan. Git deployment reports completed.
- Connected repository: Nyiawungtech/debt-remindeer-app, selected repository only. Hostinger’s required administration/code/pull-request write permissions were explicitly approved by the owner.
- Static deployment branch: `release/hostinger`, release commit `be5db0ef73c89a9bae8a5bf6cebcb821fd757cd9`, build `20743a39b5ede68b`, version `0.2.0-beta`. The 31-file release tree was verified against the local build before publishing.
- Source branch: `codex/duewell-pwa`, draft pull request #1. Keep the acceptance limits below visible before wider promotion.
- Support: `support@settleupapp.cloud` is an active alias of the existing `reminders@settleupapp.cloud` mailbox. No new mailbox purchase was needed. Unrelated hosted websites were not modified.

## Backend and authentication

- Supabase `motuhpcynixmorwolnlv`, US East: six applied migrations, RLS on all six public tables, invoker API wrappers and narrow ownership-checked implementations.
- Worker v4 handles email and Web Push. Five jobs are processed concurrently per invocation, at most three device sends per job at once, with minute scheduling and conservative retries. SMS remains deferred.
- Stable VAPID identity, restricted Resend key, sender `SettleUp <reminders@settleupapp.cloud>` and canonical app URL are stored in encrypted Vault. No server secrets are in the frontend or source repository.
- Production Auth URL/redirects and custom Resend SMTP are configured. Confirmed email, a visually verified 12-character minimum password, secure email/password changes and optional TOTP protect accounts. Password/email changes and MFA enrollment/removal trigger security emails.
- Confirmation and recovery messages use SettleUp branding. PKCE links must be opened in the browser that requested them.
- Resend previously reported the owner-approved setup email as delivered. This verifies the sending integration, not a real account’s scheduled reminder or inbox read.

## Verified

- 42 automated tests pass: PostgreSQL ownership and money invariants through PGlite, reminder channels/opt-out, provider errors/privacy, encrypted VAPID request construction, pagination and service-worker cache/URL boundaries.
- TypeScript/Vite production build and Deno checks pass. GitHub Actions passed on the published source. Live transactional checks passed with all synthetic account/financial data rolled back. Supabase security advisors reported no notices.
- Live HTTPS root returns 200. HTTP and www redirect to the canonical HTTPS origin. CSP, HSTS, nosniff, manifest MIME and no-cache HTML/manifest/service-worker headers were confirmed. Service-Worker-Allowed is `/`.
- Live release.json and service-worker cache version match the tested build. All 28 precache assets returned 200; PNG dimensions were correct for 192, 512, maskable and Apple touch icons.
- Server HEAD requests to `/.git/HEAD` and `/.env` return 403.
- Browser sample flow: added $200 as four $50 installments; recorded $25; verified $175 remaining and updated progress; scheduled a future sample reminder. The demo clearly says no messages are sent and uses in-memory records.
- Fixed header confirmed during scrolling. Compact responsive layout and mobile navigation visually checked at about 449 CSS pixels using browser zoom. Public help/privacy/terms pages render and show the support address.

## Acceptance still pending

- Owner signup, confirmation and password recovery using the production app and the owner’s chosen credentials.
- A real scheduled email and Web Push message, provider acceptance and owner-observed receipt. No actual device receipt is claimed yet.
- Installed iOS Home Screen and Android physical-device checks. Narrow browser rendering is not physical-device acceptance.
- A live offline reload/install check: this cloud browser blocks developer tools, so no bypass was attempted. Automated service-worker behavior and public assets were verified; financial records require internet and are not cached.
- This is a public beta, not an independently audited financial service. Payments occur with lenders; Mark as paid only updates the tracker.
