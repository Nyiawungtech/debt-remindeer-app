import { useEffect, useRef, useState, type FormEvent } from "react";
import { MailCheck, RefreshCw } from "lucide-react";
import { appUrl, supabase } from "../lib/client";
import {
  CONFIRMATION_COOLDOWN_MS,
  readPendingConfirmation,
  rememberConfirmation,
  type PendingConfirmation,
} from "../lib/confirmation";
import { Brand, ErrorText, Field } from "./ui";

export function EmailConfirmation({
  initial,
  onSignIn,
  onUseAnotherEmail,
}: {
  initial?: PendingConfirmation | null;
  onSignIn: (email: string) => void;
  onUseAnotherEmail: () => void;
}) {
  const [pending, setPending] = useState(
    () => initial || readPendingConfirmation(),
  );
  const [email, setEmail] = useState(pending?.email || "");
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const seconds = Math.max(
    0,
    Math.ceil(((pending?.sentAt || 0) + CONFIRMATION_COOLDOWN_MS - now) / 1000),
  );
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    const until = (pending?.sentAt || 0) + CONFIRMATION_COOLDOWN_MS;
    if (until <= Date.now()) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [pending?.sentAt]);

  async function resend(event: FormEvent) {
    event.preventDefault();
    if (busy || seconds) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!supabase)
        throw new Error(
          "The account service is unavailable. Please try again later.",
        );
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: appUrl },
      });
      if (error) throw error;
      const saved = rememberConfirmation(email);
      setPending(saved);
      setNow(saved.sentAt);
      setNotice(
        "If this account needs confirmation, a new link is on its way. Use the most recent email.",
      );
    } catch (error) {
      setError((error as Error).message);
      if ((error as { status?: number }).status === 429) {
        const saved = rememberConfirmation(email);
        setPending(saved);
        setNow(saved.sentAt);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="confirmation-page">
      <Brand />
      <section
        className="confirmation-card"
        aria-labelledby="confirmation-title"
      >
        <span className="confirmation-icon" aria-hidden="true">
          <MailCheck size={32} />
        </span>
        <span className="eyebrow">ONE LAST STEP</span>
        <h1 id="confirmation-title" ref={heading} tabIndex={-1}>
          Check your inbox.
        </h1>
        <p className="muted">
          Confirm your email to finish setting up SettleUp.
        </p>
        {pending && <p className="confirmation-address">{pending.email}</p>}
        <p className="confirmation-instructions">
          Open the confirmation link in the same browser you used to sign up.
          Once verified, you can access your account.
        </p>
        <form onSubmit={resend}>
          {!pending && (
            <Field label="Your signup email">
              <input
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
          )}
          <ErrorText text={error} />
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <button className="secondary full" disabled={busy || seconds > 0}>
            <RefreshCw size={17} />
            {busy
              ? "Sending…"
              : seconds
                ? `Resend email in ${seconds}s`
                : "Resend confirmation email"}
          </button>
        </form>
        <p className="confirmation-hint">
          Can’t find it? Check your spam or junk folder.
        </p>
        <button
          type="button"
          className="primary full"
          onClick={() => onSignIn(email)}
        >
          Back to sign in
        </button>
        <button
          type="button"
          className="text-button"
          onClick={onUseAnotherEmail}
        >
          Use another email
        </button>
        <a
          className="confirmation-support"
          href="mailto:support@settleupapp.cloud"
        >
          Need help?
        </a>
      </section>
    </main>
  );
}
