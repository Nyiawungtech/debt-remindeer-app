# Owner access and the mobile milestone

## View signups today

Sign in to the Supabase Dashboard with the project-owner account. Select the existing project `motuhpcynixmorwolnlv` (its dashboard name is still **Duewell**), then choose **Authentication → Users**. This is the account directory, including signup and confirmation information. The app's profile table is not a complete account directory: an account can exist before its profile is created on first workspace use.

SettleUp does not currently provision an in-app super-admin role or user-management screen. A normal SettleUp signup is never an administrator. Continue using Supabase's owner console for account administration. A future admin screen needs a server-enforced, explicitly assigned owner role, MFA, pagination and an audit trail; administrative keys must remain on the server. User-editable profile metadata must not confer privileges.

Reference: https://supabase.com/docs/guides/auth/managing-user-data

## Proposed hybrid build

Use **Capacitor with the existing Ionic React + TypeScript frontend and Supabase backend**. The current repository has not yet added Capacitor's iOS/Android projects. The existing `dist` build is suitable input for Capacitor; no Flutter preference has been assumed.

1. Add pinned Capacitor runtime/platform packages and native iOS/Android projects, a stable app identifier, icons, splash screens and signed release configuration. Build the web UI into the app bundle.
2. Adapt safe areas, keyboard behavior, Android Back, app resume, network states and session storage. Open email confirmation/password-recovery links through verified native deep links and test PKCE across the browser/app transition.
3. Add native device registration and delivery: APNs on iOS and Firebase Cloud Messaging on Android. The existing browser Web Push subscriptions are a different delivery system and must keep working for the PWA. Preserve the shared reminder scheduler and email delivery, with a native delivery adapter and device-token lifecycle handling.
4. Test on real iPhones and Android phones, including notification permissions, app termination, timezone/DST changes, expired sessions, account deletion, and avoiding duplicate reminders across devices. Optional biometrics, haptics and local notifications can follow a scoped decision.
5. Prepare TestFlight and Play testing releases, screenshots, store descriptions, support/privacy URLs, privacy/Data Safety disclosures, reviewer access and account-deletion flows. Store review remains a separate acceptance step.

Use a Mac with Xcode for the iOS build (or a suitable hosted macOS build service), and Android Studio for Android. The owner supplies developer accounts, completes identity verification and retains signing/account ownership. Apple Developer Program currently costs US$99 per membership year; Google Play currently charges US$25 once, before applicable local pricing/tax. Backend/email usage, build services and development work are separate costs.

New personal Google Play accounts created after November 13, 2023 currently require a closed test with at least 12 continuously opted-in testers for 14 days before applying for production access. Apple's minimum-functionality guideline expects useful app behavior beyond a repackaged website.

A planning estimate for this existing feature set is **2–4 weeks of focused implementation and device testing**, subject to account access and findings. Store testing gates, identity verification and review add calendar time; this is not a delivery commitment.

Official references, checked November 22, 2026:

- https://capacitorjs.com/docs/getting-started
- https://capacitorjs.com/docs/getting-started/environment-setup
- https://capacitorjs.com/docs/apis/push-notifications
- https://developer.apple.com/programs/whats-included
- https://developer.apple.com/app-store/review/guidelines/
- https://support.google.com/googleplay/android-developer/answer/6112435/
- https://support.google.com/googleplay/android-developer/answer/14151465?hl=en

## Clean web routes

Navigation now uses `/add`, `/debts`, `/calendar`, `/reminders`, `/settings` and `/debt/<id>`. Hostinger must serve `index.html` for application paths; the existing `.htaccess` fallback provides this. Keep the origin-root asset paths and PWA scope intact. Old root `/#...` bookmarks and previously delivered notifications are migrated to clean paths. Authentication fragments and the accessibility content anchor retain their own behavior.
