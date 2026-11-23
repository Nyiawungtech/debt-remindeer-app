import { Brand } from "./ui";

const contact = "support@settleupapp.cloud";
export function LegalPage({
  page,
  onBack,
}: {
  page: "privacy" | "terms" | "help";
  onBack: () => void;
}) {
  return (
    <main className="legal-page">
      <header>
        <Brand />
        <button className="secondary" onClick={onBack}>
          Back to SettleUp
        </button>
      </header>
      <article className="panel">
        <span className="eyebrow">SETTLEUP · PUBLIC BETA</span>
        <h1>
          {page === "privacy"
            ? "Your privacy"
            : page === "terms"
              ? "Terms of use"
              : "A little help, when you need it."}
        </h1>
        {page === "help" ? (
          <>
            <h2>Install SettleUp</h2>
            <p>
              On iPhone or iPad, open this website in Safari, choose Share, then
              Add to Home Screen. On Android or desktop, choose Install app in
              your browser’s menu. You can also use SettleUp in your browser.
            </p>
            <h2>Connect reminders</h2>
            <p>
              Verify your account email. In Settings, enable email reminders and
              connect each device where you want push notifications. On iPhone
              and iPad, open the installed Home Screen app before enabling
              notifications. Your browser will ask for permission.
            </p>
            <p>
              Open a debt, choose Set reminder beside an installment, select
              email, notifications, or both, then choose days and a time.
              Reminders follow the time zone saved in Settings. Changing your
              time zone cancels pending schedules so you can set the new times.
            </p>
            <h2>Track a payment</h2>
            <p>
              Pay your lender as usual, then choose Mark as paid in SettleUp.
              Partial payments count toward your progress. You can reverse a
              recorded payment from its history if you made a mistake.
            </p>
            <h2>When reminders change</h2>
            <p>
              A completed installment cancels its pending reminders. Turning a
              channel off cancels its pending reminders too. Reversing a payment
              does not restore cancelled reminders; set a new schedule when
              needed.
            </p>
            <h2>Offline and updates</h2>
            <p>
              The installed app caches its public screens and assets. Your
              financial records need an internet connection and are not saved in
              an offline cache. When an update is ready, use Update in the app.
            </p>
            <h2>Feedback and support</h2>
            <p>
              Email <a href={`mailto:${contact}`}>{contact}</a>. Include your
              device, browser and a brief description. Keep passwords,
              verification codes and detailed financial information out of
              support messages.
            </p>
          </>
        ) : page === "privacy" ? (
          <>
            <p className="muted">Effective November 22, 2026</p>
            <p>
              SettleUp is a debt and payment reminder service operated by the
              SettleUp project owner. This notice describes how the public beta
              uses your information. Contact{" "}
              <a href={`mailto:${contact}`}>{contact}</a> with privacy
              questions.
            </p>
            <h2>Information you provide</h2>
            <p>
              We store your account email, display name, time zone and
              preferences; debts and installment schedules you enter; recorded
              payments and reversals; reminder schedules and delivery status.
              Push notifications also require a browser subscription endpoint
              and encryption keys. SettleUp does not connect to your bank or
              collect payment-card details.
            </p>
            <h2>Why we use it</h2>
            <p>
              We use this information to authenticate your account, show your
              balances and progress, send the reminders you schedule, handle
              support and protect the service. Your financial records are scoped
              to your account. Reminder details are hidden by default; you can
              choose to include debt names and amounts in Settings.
            </p>
            <h2>Service providers</h2>
            <p>
              Hostinger hosts the website. Supabase provides authentication, the
              database and backend functions in the US East region. Resend sends
              account and reminder emails. Browser and operating-system push
              services deliver device notifications. These providers process the
              data needed for their functions and may keep operational logs
              under their own policies. Data may be processed in the United
              States and other countries used by these providers.
            </p>
            <h2>Your device</h2>
            <p>
              Your browser stores the sign-in session so the installed app can
              keep you signed in. Signing out clears that local session. Public
              app assets are cached for offline use; authenticated financial API
              responses are not cached. SettleUp includes no advertising or
              cross-site analytics SDK.
            </p>
            <h2>Your choices</h2>
            <p>
              Reminders are optional. Disable email or push in Settings, cancel
              individual pending reminders, or disconnect a device. You can also
              revoke notification permission in your browser. Export your
              records or delete your account from Settings. Account deletion
              removes your active account and tracked records; provider logs and
              backups may remain for their applicable retention periods. Emails
              already sent cannot be recalled.
            </p>
            <h2>Sharing and retention</h2>
            <p>
              We do not sell your personal information. Records are retained
              while your account is active or until you delete them. We use
              service providers to operate SettleUp and may disclose information
              when legally required or necessary to protect the service. The
              beta is intended for adults managing their own records.
            </p>
            <h2>Security and changes</h2>
            <p>
              SettleUp uses HTTPS, account access controls and database
              ownership rules. Optional authenticator verification adds another
              sign-in step. No service can promise absolute security. We will
              update this notice as the service changes and show its effective
              date here.
            </p>
          </>
        ) : (
          <>
            <p className="muted">Effective November 22, 2026</p>
            <p>
              These terms apply to the SettleUp public beta at
              settleupapp.cloud. By creating an account, you agree to these
              terms and acknowledge the <a href="/privacy">Privacy Policy</a>.
              Contact <a href={`mailto:${contact}`}>{contact}</a> for help.
            </p>
            <h2>What SettleUp does</h2>
            <p>
              SettleUp organizes the debts, payment records and schedules you
              enter. Mark as paid updates your tracker. Payments must be made
              with your lender through its usual channels. SettleUp does not
              lend money, transfer funds, service loans or verify a lender’s
              actual balance, interest or fees.
            </p>
            <h2>Your account and records</h2>
            <p>
              Use an email address you control, keep your credentials private
              and enter accurate information. You are responsible for your
              account activity and for checking payment amounts and due dates
              with your lender. Use the service for your own records and only
              provide information you are entitled to use.
            </p>
            <h2>Reminders and the beta</h2>
            <p>
              Reminder delivery depends on network access, service providers,
              device permissions, email filtering and your settings. Messages
              may be delayed or fail. Keep another way to track important
              deadlines. Features may change during the beta, and we may
              restrict abusive activity or temporarily suspend the service for
              maintenance or security.
            </p>
            <h2>Acceptable use</h2>
            <p>
              Do not attempt to access another person’s records, bypass security
              or rate limits, send abusive content, overload the service or use
              it for unlawful purposes. Automated misuse and unsolicited
              messaging are prohibited.
            </p>
            <h2>Availability and responsibility</h2>
            <p>
              The public beta is provided as available without a guarantee of
              uninterrupted service or successful reminder delivery. To the
              extent permitted by applicable law, the project owner is not
              responsible for lender fees or losses caused by missed, delayed or
              incorrect records or reminders. These terms do not limit rights
              that applicable law does not allow to be limited.
            </p>
            <h2>Leaving SettleUp</h2>
            <p>
              You can export your records and delete your account in Settings.
              We may suspend access for misuse or a security issue. Updates to
              these terms will be published here with a new effective date.
            </p>
          </>
        )}
        <nav className="legal-links" aria-label="Help and policies">
          <a href="/help">Help</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href={`mailto:${contact}`}>Contact support</a>
        </nav>
      </article>
    </main>
  );
}
