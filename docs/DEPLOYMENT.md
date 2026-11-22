# Deployment

## Existing hosted project

Duewell is already created as `motuhpcynixmorwolnlv`. Its four migrations, backend functions and minute Cron job have been deployed. Use the existing project rather than creating a duplicate. Local migration filenames match the hosted migration history.

The following steps also document a fresh setup or later operator changes. With CLI v3, inspect `--help` and select a remote target explicitly for hosted changes. CLI authentication is separate from the ChatGPT Supabase connection.

## 1. Supabase project

Create or select a project for Duewell. Keep production and test accounts separate. With the Supabase CLI authenticated:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

All core migrations must succeed. The scheduler migration requires the named Vault entries to exist first, so seed runtime settings before applying that platform-specific migration on a fresh project. The `auth` schema, auth functions, and platform roles are supplied by Supabase. Do not run the PGlite test fixtures against a live project.

Set Auth Site URL to the final HTTPS PWA origin and allow that exact origin as a redirect. Use email confirmation, 12-character minimum passwords, secure email changes and reasonable signup/reset/phone rate limits. Configure production SMTP; default development email limits are not a public launch email service. Enable TOTP factors. Enable a supported Supabase phone SMS provider (Twilio) for **phone-change verification**. Verification messages and scheduled reminders are separate provider calls.

## 2. Messaging providers

**Twilio:** use a paid account and a Messaging Service with an appropriate registered sender for the countries being served. Configure sender approval/registration before public rollout. Enable Advanced Opt-Out, set HELP to your actual support contact, and set the incoming message webhook to the deployed `twilio-webhook` function. The app provides opt-in, verified destinations, STOP handling and consent timestamps; you still need to configure sender identity and provider policy requirements. Trial accounts cannot send unrestricted messages to every signup.

**Resend:** verify a sending domain and use an authenticated `EMAIL_FROM` address. Reminder mail is sent only to the account’s confirmed email.

**Web Push:** generate VAPID keys using `npm run keys:push`. Keep the private key server-side. Put the same public key in both the frontend and Edge Function environment. Use a real VAPID contact email. On iOS, users must install the PWA to the Home Screen before enabling push. All browsers require user permission.

SMS and email may incur provider charges; no billing plan is assumed or purchased by this repository.

## 3. Edge secrets and deployment

The deployed backend reads encrypted Vault entries named `duewell_` plus the lowercase setting name, for example `duewell_twilio_auth_token`, through a service-role-only RPC. It also supports Edge environment variables taking precedence. The generated worker secret and VAPID keys are already stored in Vault; do not rotate them just to deploy the frontend.

For this project, configure provider values in Vault so the same protected configuration works without exporting secrets into source. Set `duewell_app_url` to the final HTTPS frontend origin and `duewell_vapid_subject` to its support/contact URL. No provider secret belongs in frontend files.

Use the names in `supabase/functions/.env.example`; enter actual values through secure Supabase settings or a locally ignored secrets file. Never commit secrets or send them through chat. Generate `WORKER_SECRET` using a cryptographically random source (at least 32 bytes).

```sh
supabase secrets set --env-file YOUR_PRIVATE_ENV_FILE
supabase functions deploy reminder-worker
supabase functions deploy twilio-webhook
supabase functions deploy account
```

The functions intentionally perform their own authentication: worker secret for Cron, verified Twilio signature for provider callbacks, and server-validated user token + password + MFA assurance for account deletion. The function gateway JWT switch is disabled so modern Supabase publishable keys and Twilio callbacks work.

Set `TWILIO_WEBHOOK_URL` to the canonical deployed HTTPS webhook URL, with no query string. The worker adds the reminder ID to status callback URLs. Twilio signature verification must use the same canonical URL that Twilio signs. Never use a proxy host’s internal URL.

## 4. Scheduler

In Supabase Vault, create:

- `duewell_worker_url`: the deployed reminder-worker HTTPS URL.
- `duewell_worker_secret`: the exact same value as Edge `WORKER_SECRET`.

Run `supabase/schedule.sql` as an administrator. It creates one named minute job, replacing a previous job of the same name. Verify the Cron job and `net.http_post` results. The browser and service worker do **not** schedule background SMS; the database clock does.

Jobs older than 24 hours are skipped instead of producing a backlog of stale messages. A completed installment, disabled channel, missing verified contact or removed consent prevents dispatch. A retry only follows a confirmed provider 429; a timeout/crash has an uncertain result and is not automatically resent. Provider acceptance is not labeled carrier delivery. SMS is limited to 24 reminders per account per rolling 24 hours. Configure provider budgets and alarms for your expected public volume.

## 5. PWA hosting

Set the frontend public environment values from `.env.example`, then run `npm run build`. Serve `dist/` over HTTPS. A Netlify build manifest and static `_headers` are included. For another host, apply equivalent security headers and make HTML/service worker revalidate. Never cache Supabase API responses in a CDN or service worker.

For a Supabase custom domain, update the CSP `connect-src` host explicitly. The supplied CSP allows `*.supabase.co`; it does not permit arbitrary API domains. All fonts ship with the bundle. There are no analytics scripts or third-party font requests.

Do not put Twilio, Resend, service-role, scheduler or VAPID private keys in `VITE_` variables: those are public bundle contents.

## 6. Real-service acceptance before launch

Use dedicated test accounts and numbers you control. Confirm all of the following in the deployed environment:

1. Two separate users can sign up and confirm email; each sees only their own data. Direct cross-user RPC/REST requests fail.
2. Create a $200 debt with four $50 installments; record $20, then $30. The first installment completes, its reminders cancel and balance becomes $150. Reverse the $30: the balance becomes $180 and old reminders remain cancelled.
3. Verify a phone, opt in explicitly, schedule a short test reminder, close the app and confirm actual Twilio delivery plus carrier status in the PWA. Reply STOP and confirm no subsequent SMS is dispatched.
4. Confirm email arrival with the verified domain. Register a browser push subscription and confirm a server-sent notification with the app closed on Android, desktop and an installed iPhone PWA.
5. Test denied permissions, disabled channels, provider 429, removed push subscriptions, incomplete provider configuration and an expired worker lease. No false “delivered” state or silent duplicate sends should occur.
6. Enable TOTP, sign out, sign in again and verify data remains inaccessible until completing MFA. Confirm recovery and account deletion behavior with test data.
7. Verify actual HTTPS response headers, manifest installability, service-worker update, offline fallback and responsive screens on target devices.

The PGlite suite skips the platform-specific scheduler migration; the deployed scheduler is checked against hosted Supabase. Local automated tests cannot prove external carrier delivery, the host’s HTTPS headers or installed iOS behavior. Record these deployment results before public invitations.
