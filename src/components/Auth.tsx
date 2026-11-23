import { useEffect, useState, type FormEvent } from "react";
import {
  ShieldCheck,
  BellRing,
  CalendarCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { appUrl, configured, supabase } from "../lib/client";
import { Brand, ErrorText, Field } from "./ui";
export function Auth({
  onDemo,
  recovery = false,
  onRecovered,
}: {
  onDemo: () => void;
  recovery?: boolean;
  onRecovered: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset" | "recovery">(
    recovery ? "recovery" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [agreed, setAgreed] = useState(false);
  useEffect(() => {
    if (recovery) setMode("recovery");
  }, [recovery]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!supabase)
        throw new Error(
          "Accounts are awaiting backend connection. You can explore the interactive demo below.",
        );
      let result;
      if (mode === "signup") {
        if (!agreed)
          throw new Error(
            "Please read and accept the terms before creating an account.",
          );
        result = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: name,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              terms_version: "2026-11-22-beta",
            },
            emailRedirectTo: appUrl,
          },
        });
        if (!result.error)
          setNotice("Check your email to confirm your account, then sign in.");
      } else if (mode === "reset") {
        result = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: appUrl,
        });
        if (!result.error)
          setNotice(
            "If an account exists for this email, a password reset link is on its way. Open it in this browser.",
          );
      } else if (mode === "recovery") {
        result = await supabase.auth.updateUser({ password });
        if (!result.error) {
          onRecovered();
          setNotice("Password updated.");
        }
      } else
        result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function change(next: typeof mode) {
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">A little clarity. A lot less worry.</span>
          <h1>
            Every payment.
            <br />A clearer picture.
          </h1>
          <p>
            One calm place for your balances, your upcoming payments, and those
            little reminders that make a big difference.
          </p>
          <div className="auth-preview">
            <span>YOUR NEXT LITTLE WIN</span>
            <strong>One payment closer.</strong>
            <div className="bar">
              <span style={{ width: "68%" }} />
            </div>
            <small>A plan you can see. Progress you can feel.</small>
          </div>
        </div>
        <div className="auth-benefits">
          <span>
            <CalendarCheck />
            Know what’s next
          </span>
          <span>
            <BellRing />
            Remember with ease
          </span>
          <span>
            <ShieldCheck />
            Your own private space
          </span>
        </div>
      </section>
      <section className="auth-form">
        <span className="eyebrow">WELCOME TO SETTLEUP · PUBLIC BETA</span>
        <h2>
          {mode === "signup"
            ? "Let’s get you a clearer picture."
            : mode === "reset"
              ? "Let’s get you back in."
              : mode === "recovery"
                ? "Choose a new password."
                : "A little peace of mind awaits."}
        </h2>
        <p className="muted">
          {mode === "signup"
            ? "Create an account to keep your debts and reminders together."
            : mode === "reset"
              ? "We’ll email you a secure password reset link."
              : mode === "recovery"
                ? "Use at least 12 characters for your new password."
                : "Sign in to see where you stand and what’s coming up."}
        </p>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <Field label="Your name">
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="given-name"
              />
            </Field>
          )}
          {mode !== "recovery" && (
            <Field label="Email address">
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
          )}
          {mode !== "reset" && (
            <Field
              label="Password"
              hint={
                mode === "signup"
                  ? "At least 12 characters. A unique passphrase works well."
                  : undefined
              }
            >
              <div className="password-field">
                <input
                  required
                  type={show ? "text" : "password"}
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={1024}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
          )}
          {mode === "signup" && (
            <label className="consent">
              <input
                required
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                I agree to the <a href="#terms">Terms</a> and acknowledge the{" "}
                <a href="#privacy">Privacy Policy</a>.
              </span>
            </label>
          )}
          <ErrorText text={error} />
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : mode === "reset"
                  ? "Send reset link"
                  : mode === "recovery"
                    ? "Update password"
                    : "Sign in"}
          </button>
        </form>
        {mode === "login" && (
          <button className="text-button" onClick={() => change("reset")}>
            Forgot password?
          </button>
        )}
        {mode !== "recovery" && (
          <p className="auth-switch">
            {mode === "signup"
              ? "Already have an account?"
              : "New to SettleUp?"}{" "}
            <button
              className="text-button"
              onClick={() => change(mode === "signup" ? "login" : "signup")}
            >
              {mode === "signup" ? "Sign in" : "Create account"}
            </button>
          </p>
        )}
        {mode === "reset" && (
          <button className="text-button" onClick={() => change("login")}>
            Back to sign in
          </button>
        )}
        <div className="auth-demo">
          <button className="secondary full" onClick={onDemo}>
            Explore the interactive demo
          </button>
          <small>
            {configured
              ? "Try sample debts before creating an account."
              : "Preview workspace · Live accounts and delivery await service setup."}
          </small>
        </div>
        <nav className="legal-links" aria-label="Help and policies">
          <a href="#help">Help</a>
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
        </nav>
        <p className="legal-note">
          SettleUp tracks payments you make elsewhere. It doesn’t transfer money
          or connect to your bank.
        </p>
      </section>
    </main>
  );
}
