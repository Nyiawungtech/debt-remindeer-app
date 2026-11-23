import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { Temporal } from "@js-temporal/polyfill";
import {
  LayoutDashboard,
  Wallet,
  CalendarDays,
  Bell,
  Settings,
  Plus,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Search,
  Check,
  CheckCheck,
  Clock,
  ShieldCheck,
  LogOut,
  Download,
  RefreshCw,
  Trash2,
  Pencil,
  Mail,
  X,
  CircleAlert,
  Menu,
} from "lucide-react";
import { configured, supabase } from "./lib/client";
import { useWorkspace } from "./lib/workspace";
import {
  addDays,
  balance,
  debtItems,
  emptyCopy,
  formatDate,
  inPeriod,
  money,
  paidFor,
  periodInfo,
  progress,
  remaining,
  splitSchedule,
  toCents,
  today,
  validatePayment,
  validateSchedule,
  type Channel,
  type Debt,
  type Installment,
  type Period,
  type Profile,
  type Snapshot,
} from "./lib/domain";
import {
  enablePush,
  disablePush,
  detachPush,
  devicePushConnected,
} from "./lib/push";
import { LegalPage } from "./components/LegalPage";
import { Auth } from "./components/Auth";
import { DateInput } from "./components/DateInput";
import {
  currentRoute,
  handleAppLink,
  migrateLegacyRoute,
  navigate,
} from "./lib/navigation";
import {
  Bar,
  Brand,
  Empty,
  ErrorText,
  Field,
  Merchant,
  Modal,
} from "./components/ui";

type Action = (name: string, args: Record<string, unknown>) => Promise<void>;
type ModalState = {
  type:
    | "payment"
    | "reminder"
    | "edit"
    | "delete"
    | "history"
    | "installment"
    | "delete-account";
  id?: string;
};
type UI = {
  s: Snapshot;
  day: string;
  email: string;
  demo: boolean;
  busy: boolean;
  act: Action;
  refresh: () => Promise<void>;
  open: (m: ModalState) => void;
  go: (route: string) => void;
  toast: (text: string) => void;
  cash: (n: number) => string;
};
const Context = createContext<UI>(null!);
const useUI = () => useContext(Context);
const navItems = [
  ["home", "Overview", LayoutDashboard],
  ["debts", "My debts", Wallet],
  ["calendar", "Calendar", CalendarDays],
  ["reminders", "Reminders", Bell],
  ["settings", "Settings", Settings],
] as const;
const categoryOptions = [
  "Shopping",
  "Auto",
  "Home",
  "Health",
  "Personal",
  "Other",
];
function useRoute() {
  const [route, setRoute] = useState(() => {
    migrateLegacyRoute();
    return currentRoute();
  });
  useEffect(() => {
    const change = () => {
      migrateLegacyRoute();
      setRoute(currentRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", change);
    window.addEventListener("settleup-navigation", change);
    window.addEventListener("hashchange", change);
    document.addEventListener("click", handleAppLink);
    return () => {
      window.removeEventListener("popstate", change);
      window.removeEventListener("settleup-navigation", change);
      window.removeEventListener("hashchange", change);
      document.removeEventListener("click", handleAppLink);
    };
  }, []);
  return route;
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [mfaChecked, setMfaChecked] = useState(false);
  const [mfaFactor, setMfaFactor] = useState("");
  const [demo, setDemo] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [hidden, setHidden] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [update, setUpdate] = useState(false);
  const [install, setInstall] = useState<any>(null);
  const route = useRoute();
  const workspace = useWorkspace(
    mfaChecked && !mfaFactor ? session : null,
    demo,
  );
  const { data: s, busy, act } = workspace;
  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (active) {
        setSession(data.session);
        setChecking(false);
        if (error) setToast(error.message);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!session) {
      setMfaChecked(true);
      setMfaFactor("");
      return;
    }
    let active = true;
    setMfaChecked(false);
    void (async () => {
      const { data, error } =
        await supabase!.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active) return;
      if (error) {
        setToast(error.message);
        return;
      }
      if (data.currentLevel === "aal1" && data.nextLevel === "aal2") {
        const { data: factors } = await supabase!.auth.mfa.listFactors();
        if (active)
          setMfaFactor(
            factors?.totp.find((f) => f.status === "verified")?.id || "",
          );
      } else setMfaFactor("");
      if (active) setMfaChecked(true);
    })();
    return () => {
      active = false;
    };
  }, [session?.access_token]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine),
      updates = () => setUpdate(true),
      prompt = (e: Event) => {
        e.preventDefault();
        setInstall(e);
      };
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    window.addEventListener("settleup-update", updates);
    window.addEventListener("beforeinstallprompt", prompt);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
      window.removeEventListener("settleup-update", updates);
      window.removeEventListener("beforeinstallprompt", prompt);
    };
  }, []);
  useEffect(() => {
    const pref = s?.profile.theme || "system";
    const query = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        pref === "system" ? (query.matches ? "dark" : "light") : pref);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [s?.profile.theme]);
  const go = (path: string) => {
    navigate(path);
    setModal(null);
  };
  const safeAct: Action = async (name, args) => {
    if (!online && !demo)
      throw new Error("Connect to the internet to save this change.");
    await act(name, args);
  };
  async function signOut() {
    try {
      if (!demo) {
        await detachPush();
        const { error } = await supabase!.auth.signOut();
        if (error) throw error;
      }
      setDemo(false);
      setModal(null);
      go("home");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  if (["privacy", "terms", "help"].includes(route))
    return (
      <LegalPage
        page={route as "privacy" | "terms" | "help"}
        onBack={() => go("home")}
      />
    );
  if (checking)
    return (
      <div className="loading">
        <Brand />
        <p>Finding a little clarity…</p>
      </div>
    );
  if ((!session && !demo) || recovery)
    return (
      <>
        <Auth
          onDemo={() => {
            setDemo(true);
            go("home");
          }}
          recovery={recovery}
          onRecovered={() => setRecovery(false)}
        />
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </>
    );
  if (!demo && session && (!mfaChecked || mfaFactor))
    return mfaFactor ? (
      <MfaChallenge
        factorId={mfaFactor}
        onDone={() => {
          setMfaFactor("");
          void workspace.refresh();
        }}
        onSignOut={signOut}
      />
    ) : (
      <div className="loading">
        <Brand />
        <p>Checking your account security…</p>
        <button className="text-button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    );
  if (!s)
    return (
      <main className="loading">
        <Brand />
        {workspace.error ? (
          <>
            <ErrorText text={workspace.error} />
            <button
              className="primary"
              onClick={() => void workspace.refresh()}
            >
              Try again
            </button>
            <button className="text-button" onClick={() => void signOut()}>
              Sign out
            </button>
          </>
        ) : (
          <p>Loading your workspace…</p>
        )}
      </main>
    );
  const day = today(s.profile.timezone);
  const current =
    navItems.find((n) => n[0] === route)?.[1] ||
    (route === "add"
      ? "Add debt"
      : route.startsWith("debt/")
        ? "Debt details"
        : "Overview");
  async function installApp() {
    if (install) {
      await install.prompt();
      setInstall(null);
    } else
      setToast(
        "On iPhone: Share → Add to Home Screen. On Android or desktop: use your browser’s Install app option.",
      );
  }
  async function updateApp() {
    const registration = await navigator.serviceWorker.ready;
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => location.reload(),
      { once: true },
    );
  }
  return (
    <Context.Provider
      value={{
        s,
        day,
        email: session?.user.email || (demo ? "alex@example.com" : ""),
        demo,
        busy,
        act: safeAct,
        refresh: workspace.refresh,
        open: setModal,
        go,
        toast: setToast,
        cash: (n) => (hidden ? "••••" : money(n)),
      }}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {demo && (
        <div className="demo-banner">
          <span>
            <b>Interactive demo</b> · Sample data · Changes reset when you leave
            · No reminders sent
          </span>
          <button
            onClick={() => {
              setDemo(false);
              go("home");
            }}
          >
            Create your account
          </button>
        </div>
      )}
      <aside className="sidebar">
        <Brand />
        <span className="workspace-label">YOUR PERSONAL SPACE</span>
        <nav aria-label="Main navigation">
          {navItems.map(([path, label, Icon]) => (
            <button
              key={path}
              className={
                route === path ||
                (path === "debts" && route.startsWith("debt/"))
                  ? "active"
                  : ""
              }
              onClick={() => go(path)}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={23} />
          <h3>A clearer path forward.</h3>
          <p>Keep every payment in view, one small step at a time.</p>
          <button className="text-button" onClick={() => void installApp()}>
            <Download size={16} />
            Install SettleUp
          </button>
        </div>
        <button className="profile-button" onClick={() => go("settings")}>
          <span className="avatar">
            {(s.profile.display_name || session?.user.email || "D")
              .slice(0, 1)
              .toUpperCase()}
          </span>
          <span>
            <b>{s.profile.display_name || "Your workspace"}</b>
            <small>{demo ? "Demo account" : "Personal account"}</small>
          </span>
        </button>
      </aside>
      <header className="topbar">
        <div className="mobile-brand">
          <Brand />
        </div>
        <span className="breadcrumb">
          Your workspace <span>/</span> <b>{current}</b>
        </span>
        <div className="top-actions">
          <span className="top-date">{formatDate(day, true)}</span>
          <button
            className="icon-button"
            title={hidden ? "Show balances" : "Hide balances"}
            aria-label={hidden ? "Show balances" : "Hide balances"}
            onClick={() => setHidden(!hidden)}
          >
            {hidden ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
          <button
            className="icon-button"
            aria-label="View reminders"
            onClick={() => go("reminders")}
          >
            <Bell size={20} />
          </button>
          <button
            className="avatar"
            aria-label="Account settings"
            onClick={() => go("settings")}
          >
            {(s.profile.display_name || "D")[0].toUpperCase()}
          </button>
        </div>
      </header>
      <main id="main-content" className="main" tabIndex={-1}>
        {!online && (
          <div className="notice">
            <CircleAlert size={18} />
            You’re offline. Reconnect before saving changes. Server reminders
            continue independently.
          </div>
        )}
        {update && (
          <div className="notice">
            A fresh version of SettleUp is ready.{" "}
            <button className="text-button" onClick={() => void updateApp()}>
              Update now
            </button>
          </div>
        )}
        {workspace.error && (
          <div className="error" role="alert">
            Couldn’t refresh: {workspace.error}{" "}
            <button
              className="text-button"
              onClick={() => void workspace.refresh()}
            >
              Retry
            </button>
          </div>
        )}
        <div key={route} className="page">
          {route === "add" ? (
            <AddDebt />
          ) : route.startsWith("debt/") ? (
            <DebtDetail id={route.slice(5)} />
          ) : route === "debts" ? (
            <Debts />
          ) : route === "calendar" ? (
            <Calendar />
          ) : route === "reminders" ? (
            <Reminders />
          ) : route === "settings" ? (
            <SettingsPage
              session={session}
              onSignOut={signOut}
              onInstall={installApp}
            />
          ) : (
            <Home />
          )}
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map(([path, label, Icon]) => (
          <button
            key={path}
            className={route === path ? "active" : ""}
            onClick={() => go(path)}
          >
            <Icon size={21} />
            <span>
              {label === "My debts"
                ? "Debts"
                : label === "Overview"
                  ? "Home"
                  : label}
            </span>
          </button>
        ))}
      </nav>
      {modal && (
        <Modal
          title={
            {
              payment: "Mark as paid",
              reminder: "A little reminder",
              edit: "Edit debt",
              delete: "Delete this debt?",
              history: "Payment history",
              installment: "Edit installment",
              "delete-account": "Delete your account?",
            }[modal.type]
          }
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          <ModalBody value={modal} close={() => setModal(null)} />
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Dismiss message" onClick={() => setToast("")}>
            <X size={17} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
function PageHeading({
  title,
  description,
  action = true,
}: {
  title: string;
  description: string;
  action?: boolean;
}) {
  const { go } = useUI();
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && (
        <button
          className="primary"
          aria-label="Add debt"
          onClick={() => go("add")}
        >
          <Plus size={20} />
          <span>Add debt</span>
        </button>
      )}
    </div>
  );
}
function PaymentRow({
  i,
  showPaid = false,
}: {
  i: Installment;
  showPaid?: boolean;
}) {
  const { s, day, go, cash } = useUI();
  const d = s.debts.find((d) => d.id === i.debt_id)!;
  const left = remaining(s, i);
  return (
    <button className="payment-row" onClick={() => go(`debt/${d.id}`)}>
      <span className="date-tile">
        <small>
          {Temporal.PlainDate.from(i.due_date).toLocaleString("en-US", {
            month: "short",
          })}
        </small>
        <b>{i.due_date.slice(8)}</b>
      </span>
      <div className="payment-info">
        <strong>{d.name}</strong>
        <small>
          {formatDate(i.due_date)}
          {left > 0 && i.due_date < day
            ? " · Overdue"
            : left === 0
              ? " · Paid"
              : ""}
        </small>
      </div>
      <span className="row-amount">
        {cash(showPaid ? i.amount_cents : left)}
        <ChevronRight size={17} />
      </span>
    </button>
  );
}
function DebtCard({ d }: { d: Debt }) {
  const { s, day, go, cash } = useUI();
  const left = balance(s, d.id);
  const items = debtItems(s, d.id);
  const next = items.find((i) => remaining(s, i) > 0);
  const pct = progress(s, d);
  return (
    <button className="debt-card" onClick={() => go(`debt/${d.id}`)}>
      <div className="row between">
        <Merchant category={d.category} />
        <span
          className={`pill ${!left ? "green" : next && next.due_date < day ? "red" : ""}`}
        >
          {!left
            ? "Completed"
            : next && next.due_date < day
              ? "Needs attention"
              : "Active"}
        </span>
      </div>
      <h3>{d.name}</h3>
      <p className="muted small">{d.lender || d.category}</p>
      <div className="debt-amount">
        {cash(left)} <small>remaining</small>
      </div>
      <Bar value={pct} />
      <div className="row between small muted">
        <span>{pct}% paid off</span>
        <span>
          {cash(d.total_cents - left)} of {cash(d.total_cents)}
        </span>
      </div>
      <footer>
        {next ? (
          <>
            <span>Next payment · {formatDate(next.due_date)}</span>
            <b>{cash(remaining(s, next))}</b>
          </>
        ) : (
          <span>
            <CheckCheck size={15} /> Every payment, completed.
          </span>
        )}
      </footer>
    </button>
  );
}
function Home() {
  const { s, day, go, cash, open } = useUI();
  const [period, setPeriod] = useState<Period>("month");
  const total = s.debts.reduce((n, d) => n + d.total_cents, 0),
    left = balance(s),
    paid = total - left;
  const pct = total ? Math.floor((paid / total) * 100) : 0;
  const active = s.debts.filter((d) => balance(s, d.id) > 0);
  const all = s.installments
    .filter((i) => remaining(s, i) > 0)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const next = all.find((i) => i.due_date >= day);
  const overdue = all.filter((i) => i.due_date < day);
  const info = periodInfo(s, period, day);
  const copy = emptyCopy(s, period, day);
  const nextDebt = next && s.debts.find((d) => d.id === next.debt_id);
  return (
    <>
      <PageHeading
        title={`${new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening"}${s.profile.display_name ? ", " + s.profile.display_name.split(" ")[0] : ""}.`}
        description="A little clarity for every payment."
      />
      <section className="hero-grid">
        <div className="balance-card">
          <span className="eyebrow">YOUR DEBT BALANCE</span>
          <div className="balance-content">
            <div>
              <strong className="balance-number">{cash(left)}</strong>
              <p>
                remaining across {active.length} active{" "}
                {active.length === 1 ? "debt" : "debts"}
              </p>
            </div>
            <div
              className="progress-ring"
              style={{
                background: `conic-gradient(var(--purple) ${pct}%,var(--hero-track) 0)`,
              }}
            >
              <div>
                <b>{pct}%</b>
                <small>paid off</small>
              </div>
            </div>
          </div>
          <footer>
            <div>
              <span>Total tracked</span>
              <b>{cash(total)}</b>
            </div>
            <div>
              <span>Paid so far</span>
              <b>{cash(paid)}</b>
            </div>
            <div>
              <span>Completed</span>
              <b>
                {s.debts.length - active.length}{" "}
                {s.debts.length - active.length === 1 ? "debt" : "debts"}
              </b>
            </div>
          </footer>
        </div>
        <div className="next-card">
          <div className="row between">
            <span className="eyebrow">YOUR NEXT PAYMENT</span>
            <span className="next-icon">
              <CalendarDays size={20} />
            </span>
          </div>
          {next ? (
            <>
              <div>
                <strong>{cash(remaining(s, next))}</strong>
                <h3>{nextDebt?.name}</h3>
                <p>
                  {formatDate(next.due_date, true)}
                  {next.due_date === day ? " · Today" : ""}
                </p>
              </div>
              <button onClick={() => go(`debt/${next.debt_id}`)}>
                View payment
              </button>
            </>
          ) : (
            <>
              <div>
                <strong>{left ? "Let’s catch up." : "Looking clear."}</strong>
                <p>
                  {left
                    ? "Review the payments that need your attention."
                    : "Your next payment will appear here."}
                </p>
              </div>
              <button onClick={() => go(left ? "debts" : "add")}>
                {left ? "Review debts" : "Add a debt"}
              </button>
            </>
          )}
        </div>
      </section>
      <div className="section-label">
        <h2>Coming up</h2>
        <span className="muted small">Plan ahead, breathe easier.</span>
      </div>
      <div className="periods">
        {(
          [
            ["week", "This week"],
            ["month", "This month"],
            ["next", "Next month"],
            ["all", "All remaining"],
          ] as const
        ).map(([p, label]) => {
          const item = periodInfo(s, p, day);
          return (
            <button
              key={p}
              className={`period-card ${period === p ? "selected" : ""}`}
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
            >
              <span>{label}</span>
              <strong>{cash(item.total)}</strong>
              <small>
                {item.outstanding.length
                  ? `${item.outstanding.length} ${item.outstanding.length === 1 ? "payment" : "payments"}`
                  : item.scheduled.length
                    ? "All paid"
                    : "Nothing scheduled"}
              </small>
            </button>
          );
        })}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              {period === "all"
                ? "All upcoming payments"
                : period === "week"
                  ? "This week’s payments"
                  : period === "next"
                    ? "Next month’s payments"
                    : "This month’s payments"}
            </h2>
            <button className="text-button" onClick={() => go("calendar")}>
              Calendar
            </button>
          </div>
          {overdue.length > 0 && (
            <button
              className="overdue-strip"
              onClick={() => go(`debt/${overdue[0].debt_id}`)}
            >
              <CircleAlert size={17} />
              {cash(overdue.reduce((n, i) => n + remaining(s, i), 0))} overdue ·
              Review payments
            </button>
          )}
          {info.outstanding.length ? (
            info.outstanding
              .sort((a, b) => a.due_date.localeCompare(b.due_date))
              .slice(0, 6)
              .map((i) => <PaymentRow key={i.id} i={i} />)
          ) : (
            <Empty {...copy}>
              {next && (
                <div className="heads-up">
                  <small>HEADS UP, NEXT ON YOUR SCHEDULE</small>
                  <b>
                    {cash(remaining(s, next))} · {nextDebt?.name}
                  </b>
                  <span>{formatDate(next.due_date, true)}</span>
                  <div className="row wrap center">
                    <button
                      className="secondary"
                      onClick={() => go(`debt/${next.debt_id}`)}
                    >
                      View payment
                    </button>
                    <button
                      className="text-button"
                      onClick={() => open({ type: "reminder", id: next.id })}
                    >
                      {s.reminders.some(
                        (r) => r.installment_id === next.id && r.active,
                      )
                        ? "Manage reminder"
                        : "Set reminder"}
                    </button>
                  </div>
                </div>
              )}
              {!s.debts.length && (
                <button
                  className="primary"
                  aria-label="Add debt"
                  onClick={() => go("add")}
                >
                  Add your first debt
                </button>
              )}
              {s.debts.length > 0 && !left && (
                <button className="secondary" onClick={() => go("debts")}>
                  View completed debts
                </button>
              )}
            </Empty>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Your debts</h2>
            <button className="text-button" onClick={() => go("debts")}>
              View all
            </button>
          </div>
          {active.length ? (
            active.slice(0, 4).map((d) => (
              <button
                className="mini-debt"
                key={d.id}
                onClick={() => go(`debt/${d.id}`)}
              >
                <div className="row">
                  <Merchant category={d.category} />
                  <div className="grow">
                    <b>{d.name}</b>
                    <small>{cash(balance(s, d.id))} remaining</small>
                  </div>
                  <span className="small muted">{progress(s, d)}%</span>
                </div>
                <Bar value={progress(s, d)} />
              </button>
            ))
          ) : (
            <Empty
              title={
                s.debts.length
                  ? "A milestone worth keeping."
                  : "Make room for clarity."
              }
              text={
                s.debts.length
                  ? "All your tracked debts are completed."
                  : "Add a debt and see your progress, one payment at a time."
              }
            >
              <button className="secondary" onClick={() => go("add")}>
                Add debt
              </button>
            </Empty>
          )}
        </section>
      </div>
      <p className="footnote">
        <ShieldCheck size={15} />
        Your balance reflects the debts and payments you’ve added to SettleUp.
      </p>
    </>
  );
}
function Debts() {
  const { s } = useUI();
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const active = s.debts.filter((d) => balance(s, d.id) > 0).length;
  const debts = s.debts.filter(
    (d) =>
      (filter === "all" ||
        (filter === "active"
          ? balance(s, d.id) > 0
          : balance(s, d.id) === 0)) &&
      `${d.name} ${d.lender}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        title="A plan for every debt."
        description="Big or small, keep them all in view."
      />
      <div className="filters">
        <div className="segmented">
          {[
            ["active", `Active (${active})`],
            ["completed", `Completed (${s.debts.length - active})`],
            ["all", "All debts"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search debts"
            placeholder="Find a debt…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {debts.length ? (
        <div className="debt-grid">
          {debts.map((d) => (
            <DebtCard key={d.id} d={d} />
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title={
              search
                ? "No matching debts."
                : filter === "completed"
                  ? "Your milestones will go here."
                  : "A fresh start."
            }
            text={
              search
                ? "Try another name or lender."
                : filter === "completed"
                  ? "Once a debt reaches zero, it appears here."
                  : "Add a debt to start tracking your payments."
            }
          />
        </section>
      )}
    </>
  );
}
function DebtDetail({ id }: { id: string }) {
  const { s, day, go, cash, open } = useUI();
  const d = s.debts.find((d) => d.id === id);
  if (!d)
    return (
      <Empty
        title="Debt not found."
        text="It may have been deleted. Return to your debts to continue."
      >
        <button className="primary" onClick={() => go("debts")}>
          My debts
        </button>
      </Empty>
    );
  const left = balance(s, d.id);
  const items = debtItems(s, id);
  return (
    <>
      <button className="back-button" onClick={() => go("debts")}>
        <ChevronLeft size={18} />
        My debts
      </button>
      <section className="detail-hero">
        <div className="row between">
          <Merchant category={d.category} large />
          <div className="row">
            <button
              className="icon-button"
              aria-label="Edit debt"
              onClick={() => open({ type: "edit", id })}
            >
              <Pencil size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Delete debt"
              onClick={() => open({ type: "delete", id })}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
        <h1>{d.name}</h1>
        <p>{d.lender || d.category}</p>
        <strong className="detail-amount">{cash(left)}</strong>
        <span className="muted small">remaining balance</span>
        <Bar value={progress(s, d)} />
        <div className="detail-stats">
          <div>
            <span>Original debt</span>
            <b>{cash(d.total_cents)}</b>
          </div>
          <div>
            <span>Paid so far</span>
            <b>{cash(d.total_cents - left)}</b>
          </div>
          <div>
            <span>Progress</span>
            <b>{progress(s, d)}% paid off</b>
          </div>
        </div>
      </section>
      <div className="detail-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Payment schedule</h2>
            <span className={`pill ${!left ? "green" : ""}`}>
              {!left
                ? "Completed"
                : `${items.filter((i) => remaining(s, i) === 0).length} of ${items.length} paid`}
            </span>
          </div>
          {items.map((i, index) => {
            const r = remaining(s, i),
              paid = paidFor(s, i.id),
              reminder = s.reminders.some(
                (r) =>
                  r.installment_id === i.id &&
                  r.active &&
                  r.state === "pending",
              );
            return (
              <article className="schedule-row" key={i.id}>
                <div className="row">
                  <span className={`schedule-check ${!r ? "done" : ""}`}>
                    {!r ? <Check size={19} /> : <span>{index + 1}</span>}
                  </span>
                  <div className="grow">
                    <b>{formatDate(i.due_date)}</b>
                    <div className="row wrap">
                      <span
                        className={`pill ${!r ? "green" : i.due_date < day ? "red" : ""}`}
                      >
                        {!r
                          ? "Paid"
                          : i.due_date < day
                            ? "Overdue"
                            : paid
                              ? "Partially paid"
                              : "Upcoming"}
                      </span>
                      {reminder && (
                        <span className="muted small">
                          <Bell size={13} />
                          Reminder set
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="schedule-money">
                    <b>{cash(r || i.amount_cents)}</b>
                    {paid > 0 && r > 0 && (
                      <small>
                        {cash(paid)} of {cash(i.amount_cents)} paid
                      </small>
                    )}
                  </div>
                </div>
                <div className="schedule-actions">
                  {r > 0 && (
                    <>
                      <button
                        className="secondary"
                        onClick={() => open({ type: "payment", id: i.id })}
                      >
                        <Check size={16} />
                        Mark as paid
                      </button>
                      <button
                        className="ghost"
                        onClick={() => open({ type: "reminder", id: i.id })}
                      >
                        <Bell size={16} />
                        {reminder ? "Manage reminder" : "Set reminder"}
                      </button>
                    </>
                  )}
                  <button
                    className="text-button"
                    onClick={() => open({ type: "installment", id: i.id })}
                  >
                    Edit
                  </button>
                  {paid > 0 && (
                    <button
                      className="text-button"
                      onClick={() => open({ type: "history", id: i.id })}
                    >
                      History
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
        <div className="stack">
          <section className="panel details-box">
            <h2>The details</h2>
            <dl>
              <div>
                <dt>Lender / store</dt>
                <dd>{d.lender || "—"}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{d.category}</dd>
              </div>
              <div>
                <dt>Installments</dt>
                <dd>{items.length}</dd>
              </div>
              <div>
                <dt>Last payment due</dt>
                <dd>
                  {items.length ? formatDate(items.at(-1)!.due_date) : "—"}
                </dd>
              </div>
            </dl>
            {d.notes && (
              <>
                <h3>Your notes</h3>
                <p className="notes">{d.notes}</p>
              </>
            )}
          </section>
          <div className="helper-card">
            <ShieldCheck size={24} />
            <h3>A tracker, with you in control.</h3>
            <p>
              Make your payment with your lender, then use “Mark as paid” here
              to update your progress.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
function AddDebt() {
  const { busy, act, go, toast } = useUI();
  const [id] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(""),
    [lender, setLender] = useState(""),
    [category, setCategory] = useState("Shopping"),
    [notes, setNotes] = useState(""),
    [total, setTotal] = useState(""),
    [count, setCount] = useState(4),
    [start, setStart] = useState(today()),
    [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly">(
      "biweekly",
    );
  const [rows, setRows] = useState([{ due_date: today(), amount: "" }]);
  const [error, setError] = useState("");
  const sum = rows.reduce((n, r) => {
    try {
      return n + toCents(r.amount || "0");
    } catch {
      return n;
    }
  }, 0);
  function generate() {
    try {
      setRows(
        splitSchedule(toCents(total), count, start, frequency).map((r) => ({
          due_date: r.due_date,
          amount: (r.amount_cents / 100).toFixed(2),
        })),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const amount = toCents(total),
        schedule = rows.map((r) => ({
          due_date: r.due_date,
          amount_cents: toCents(r.amount),
        }));
      validateSchedule(amount, schedule);
      await act("create_debt", {
        p_id: id,
        p_name: name,
        p_lender: lender,
        p_category: category,
        p_notes: notes,
        p_total: amount,
        p_schedule: schedule,
      });
      toast("Debt added. A clearer picture starts here.");
      go(`debt/${id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="form-page">
      <button className="back-button" onClick={() => go("debts")}>
        <ChevronLeft size={18} />
        My debts
      </button>
      <PageHeading
        title="Let’s make a plan."
        description="Add the details. We’ll help you keep track."
        action={false}
      />
      <form onSubmit={save}>
        <section className="panel form-section">
          <h2>First, the basics.</h2>
          <p className="muted">All amounts are in US dollars.</p>
          <Field label="Debt name">
            <input
              required
              maxLength={120}
              placeholder="e.g. Amazon iPad purchase"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="Lender or store">
              <input
                maxLength={120}
                placeholder="e.g. Amazon"
                value={lender}
                onChange={(e) => setLender(e.target.value)}
              />
            </Field>
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categoryOptions.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Total debt amount ($)">
            <input
              required
              inputMode="decimal"
              placeholder="200.00"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </Field>
          <Field label="Notes (optional)">
            <textarea
              maxLength={2000}
              rows={3}
              placeholder="Anything you’d like to remember."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </section>
        <section className="panel form-section">
          <h2>Your payment schedule.</h2>
          <p className="muted">
            Split evenly, or enter each installment yourself.
          </p>
          <div className="schedule-generator">
            <div className="form-grid">
              <Field label="Number of installments">
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </Field>
              <Field label="Frequency">
                <select
                  value={frequency}
                  onChange={(e) =>
                    setFrequency(e.target.value as typeof frequency)
                  }
                >
                  <option value="weekly">Every week</option>
                  <option value="biweekly">Every two weeks</option>
                  <option value="monthly">Every month</option>
                </select>
              </Field>
            </div>
            <Field label="First due date">
              <DateInput
                min="1900-01-01"
                max="2200-12-31"
                value={start}
                onInput={(e) => setStart(e.currentTarget.value)}
              />
            </Field>
            <button type="button" className="secondary" onClick={generate}>
              Create equal installments
            </button>
          </div>
          <div className="schedule-labels">
            <span>Due date</span>
            <span>Amount ($)</span>
          </div>
          {rows.map((r, index) => (
            <div className="schedule-editor" key={index}>
              <label className="installment-field schedule-date">
                <span>Due date</span>
                <DateInput
                  required
                  aria-label={`Installment ${index + 1} due date`}
                  min="1900-01-01"
                  max="2200-12-31"
                  value={r.due_date}
                  onInput={(e) =>
                    setRows(
                      rows.map((x, j) =>
                        j === index
                          ? { ...x, due_date: e.currentTarget.value }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label className="installment-field schedule-amount">
                <span>Amount ($)</span>
                <input
                  required
                  inputMode="decimal"
                  aria-label={`Installment ${index + 1} amount`}
                  placeholder="50.00"
                  value={r.amount}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, j) =>
                        j === index ? { ...x, amount: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="icon-button"
                disabled={rows.length === 1}
                aria-label={`Remove installment ${index + 1}`}
                onClick={() => setRows(rows.filter((_, j) => j !== index))}
              >
                <X size={18} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-button"
            disabled={rows.length >= 120}
            onClick={() =>
              setRows([
                ...rows,
                { due_date: rows.at(-1)?.due_date || today(), amount: "" },
              ])
            }
          >
            <Plus size={17} />
            Add installment
          </button>
          <div className="schedule-summary">
            <span>
              Schedule total <b>{money(sum)}</b>
            </span>
            <span>
              Debt total <b>${total || "0.00"}</b>
            </span>
          </div>
        </section>
        <ErrorText text={error} />
        <div className="form-actions">
          <button type="button" className="ghost" onClick={() => go("debts")}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save debt"}
          </button>
        </div>
      </form>
    </div>
  );
}
function Calendar() {
  const { s, day, cash } = useUI();
  const [month, setMonth] = useState(day.slice(0, 7) + "-01"),
    [selected, setSelected] = useState(day);
  const first = Temporal.PlainDate.from(month);
  const start = first.subtract({ days: first.dayOfWeek - 1 });
  const days = Array.from({ length: 42 }, (_, j) =>
    start.add({ days: j }).toString(),
  );
  const list = s.installments
    .filter((i) => i.due_date === selected)
    .sort((a, b) => a.id.localeCompare(b.id));
  const total = s.installments
    .filter((i) => i.due_date.startsWith(month.slice(0, 7)))
    .reduce((n, i) => n + remaining(s, i), 0);
  function move(by: number) {
    const next = first.add({ months: by }).toString();
    setMonth(next);
    setSelected(next);
  }
  return (
    <>
      <PageHeading
        title="A little look ahead."
        description="See your payments, day by day."
      />
      <div className="calendar-layout">
        <section className="panel calendar-panel">
          <div className="row between">
            <h2>
              {first.toLocaleString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <div className="row">
              <button
                className="text-button"
                onClick={() => {
                  setMonth(day.slice(0, 7) + "-01");
                  setSelected(day);
                }}
              >
                Today
              </button>
              <button
                className="icon-button"
                aria-label="Previous month"
                onClick={() => move(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Next month"
                onClick={() => move(1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <p className="muted small">{cash(total)} remaining this month</p>
          <div
            className="calendar-grid"
            role="group"
            aria-label="Payment calendar"
          >
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
              <span className="weekday" key={w}>
                {w}
              </span>
            ))}
            {days.map((date) => {
              const rows = s.installments.filter((i) => i.due_date === date),
                due = rows.reduce((n, i) => n + remaining(s, i), 0);
              return (
                <button
                  key={date}
                  className={`calendar-day ${date === selected ? "selected" : ""} ${date === day ? "today" : ""} ${date.slice(0, 7) !== month.slice(0, 7) ? "other-month" : ""}`}
                  aria-label={`${formatDate(date)}, ${rows.length} payments, ${money(due)} remaining`}
                  aria-pressed={selected === date}
                  onClick={() => setSelected(date)}
                >
                  <b>{date.slice(8).replace(/^0/, "")}</b>
                  {rows.length > 0 && (
                    <>
                      <span
                        className={due ? "calendar-dot" : "calendar-dot paid"}
                      />
                      <small>{due ? cash(due) : "Paid"}</small>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span>
              <i />
              Payment due
            </span>
            <span>
              <i className="paid" />
              Completed
            </span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>{formatDate(selected)}</h2>
            <span className="small muted">{list.length} payments</span>
          </div>
          {list.length ? (
            list.map((i) => (
              <PaymentRow key={i.id} i={i} showPaid={!remaining(s, i)} />
            ))
          ) : (
            <Empty
              title="A little breathing room."
              text="No payments are scheduled for this day."
            />
          )}
        </section>
      </div>
    </>
  );
}
const channelLabel = (channel: Channel) =>
  channel === "email" ? "Email" : "Notification";
function Reminders() {
  const { s, go, busy, act, toast } = useUI();
  const [view, setView] = useState("upcoming");
  const rows = s.reminders
    .filter((r) =>
      view === "upcoming"
        ? r.active && ["pending", "processing"].includes(r.state)
        : !r.active || !["pending", "processing"].includes(r.state),
    )
    .sort((a, b) =>
      view === "upcoming"
        ? a.scheduled_at.localeCompare(b.scheduled_at)
        : b.scheduled_at.localeCompare(a.scheduled_at),
    );
  async function cancel(id: string) {
    try {
      await act("cancel_reminder", { p_id: id });
      toast("Reminder cancelled.");
    } catch (e) {
      toast((e as Error).message);
    }
  }
  return (
    <>
      <PageHeading
        title="A gentle nudge, right on time."
        description="Your reminders, and how they’re getting on."
        action={false}
      />
      <div className="filters">
        <div className="segmented">
          {["upcoming", "history"].map((v) => (
            <button
              key={v}
              className={v === view ? "active" : ""}
              onClick={() => setView(v)}
            >
              {v === "upcoming" ? "Upcoming" : "Delivery history"}
            </button>
          ))}
        </div>
        <button className="ghost" onClick={() => go("settings")}>
          <Settings size={17} />
          Preferences
        </button>
      </div>
      <section className="panel">
        {rows.length ? (
          rows.map((r) => {
            const i = s.installments.find((i) => i.id === r.installment_id),
              d = s.debts.find((d) => d.id === i?.debt_id);
            if (!i || !d) return null;
            return (
              <article key={r.id} className="reminder-row">
                <span className="reminder-icon">
                  {r.channel === "email" ? (
                    <Mail size={21} />
                  ) : (
                    <Bell size={21} />
                  )}
                </span>
                <div className="grow">
                  <button
                    className="text-title"
                    onClick={() => go(`debt/${d.id}`)}
                  >
                    {d.name}
                  </button>
                  <p className="muted small">
                    {new Date(r.scheduled_at).toLocaleString("en-US", {
                      timeZone: s.profile.timezone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    · {s.profile.timezone}
                  </p>
                  <div className="row wrap">
                    <span className="pill">{channelLabel(r.channel)}</span>
                    <span
                      className={`pill ${r.state === "delivered" ? "green" : r.state === "failed" ? "red" : ""}`}
                    >
                      {r.state === "accepted"
                        ? "Accepted by provider"
                        : r.state === "pending"
                          ? "Scheduled"
                          : r.state === "processing"
                            ? "Sending"
                            : r.state[0].toUpperCase() + r.state.slice(1)}
                    </span>
                    <span className="small muted">
                      {r.days_before
                        ? `${r.days_before} ${r.days_before === 1 ? "day" : "days"} before`
                        : "On the due date"}
                    </span>
                  </div>
                  {r.error_code && (
                    <p className="small muted">
                      {r.error_code === "delivery_uncertain"
                        ? "Delivery could not be confirmed. Review before scheduling again."
                        : `Details: ${r.error_code.replaceAll("_", " ")}`}
                    </p>
                  )}
                </div>
                {r.state === "pending" && (
                  <button
                    className="icon-button"
                    aria-label={`Cancel ${channelLabel(r.channel)} reminder for ${d.name}`}
                    disabled={busy}
                    onClick={() => void cancel(r.id)}
                  >
                    <X size={18} />
                  </button>
                )}
              </article>
            );
          })
        ) : (
          <Empty
            title={
              view === "upcoming"
                ? "A reminder when you need it."
                : "Nothing sent yet."
            }
            text={
              view === "upcoming"
                ? "Open a debt and choose “Set reminder” beside a payment."
                : "You’ll see delivery status here once your reminders run."
            }
          >
            <button className="secondary" onClick={() => go("debts")}>
              View my debts
            </button>
          </Empty>
        )}
      </section>
      <p className="footnote">
        <Clock size={15} />
        “Accepted” means the delivery provider received the request. It does not
        confirm that the reminder was seen or read.
      </p>
    </>
  );
}
function SettingsPage({
  session,
  onSignOut,
  onInstall,
}: {
  session: Session | null;
  onSignOut: () => Promise<void>;
  onInstall: () => Promise<void>;
}) {
  const { s, demo, busy, act, toast, open, refresh } = useUI();
  const [p, setP] = useState(s.profile),
    [error, setError] = useState(""),
    [authBusy, setAuthBusy] = useState(false),
    [password, setPassword] = useState(""),
    [device, setDevice] = useState(false);
  useEffect(() => {
    if (!demo)
      void devicePushConnected()
        .then(setDevice)
        .catch(() => setDevice(false));
  }, [demo]);
  const zones = [
    ...new Set([
      s.profile.timezone,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...Intl.supportedValuesOf("timeZone"),
    ]),
  ];
  const update = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setP({ ...p, [key]: value });
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await act("save_preferences", {
        p_name: p.display_name,
        p_timezone: p.timezone,
        p_theme: p.theme,
        p_private: p.private_content,
        p_email: p.email_enabled,
        p_sms: false,
        p_push: p.push_enabled,
      });
      toast("Preferences saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function devicePush() {
    setAuthBusy(true);
    setError("");
    try {
      if (demo)
        throw new Error(
          "Sign in to connect a device. The demo does not send notifications.",
        );
      if (device) {
        await disablePush();
        setDevice(false);
        toast("Notifications disconnected on this device.");
      } else {
        await enablePush();
        setDevice(true);
        setP((previous) => ({ ...previous, push_enabled: true }));
        toast("This device is ready for notifications.");
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAuthBusy(false);
    }
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setError("");
    try {
      if (demo) throw new Error("Password changes need a signed-in account.");
      const { error } = await supabase!.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      toast("Password updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAuthBusy(false);
    }
  }
  function exportData() {
    const blob = new Blob(
        [
          JSON.stringify(
            { ...s, exported_at: new Date().toISOString() },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `settleup-export-${today()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Your export is ready. Keep it somewhere private.");
  }
  return (
    <>
      <PageHeading
        title="Make yourself at home."
        description="Your preferences, your reminders, your peace of mind."
        action={false}
      />
      <ErrorText text={error} />
      <div className="settings-layout">
        <form onSubmit={save} className="stack">
          <section className="panel form-section">
            <h2>Your profile</h2>
            <Field label="Your name">
              <input
                maxLength={80}
                value={p.display_name}
                onChange={(e) => update("display_name", e.target.value)}
              />
            </Field>
            <Field label="Email address">
              <input
                readOnly
                value={session?.user.email || (demo ? "alex@example.com" : "")}
              />
            </Field>
            <Field
              label="Time zone"
              hint="Changing time zone cancels pending reminders. Set them again in your new time zone."
            >
              <select
                value={p.timezone}
                onChange={(e) => update("timezone", e.target.value)}
              >
                {zones.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </Field>
            <Field label="Appearance">
              <select
                value={p.theme}
                onChange={(e) =>
                  update("theme", e.target.value as Profile["theme"])
                }
              >
                <option value="system">Use device setting</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </Field>
          </section>
          <section className="panel form-section">
            <h2>Reminder preferences</h2>
            <p className="muted">
              Choose how you receive reminders. Turning a channel off cancels
              its pending reminders.
            </p>
            <label className="toggle-row">
              <span>
                <b>Email reminders</b>
                <small>Sent to your verified account email.</small>
              </span>
              <input
                type="checkbox"
                checked={p.email_enabled}
                onChange={(e) => update("email_enabled", e.target.checked)}
              />
            </label>
            <label className="toggle-row">
              <span>
                <b>Push notifications</b>
                <small>Send reminders to your connected devices.</small>
              </span>
              <input
                type="checkbox"
                checked={p.push_enabled}
                onChange={(e) => update("push_enabled", e.target.checked)}
              />
            </label>
            <div className="device-row">
              <p className="small muted">
                {device
                  ? "Notifications are connected on this device."
                  : "Connect this device to receive reminders with the app closed."}{" "}
                On iPhone or iPad, add SettleUp to your Home Screen first.
              </p>
              <button
                type="button"
                className="secondary"
                disabled={authBusy || demo}
                onClick={() => void devicePush()}
              >
                <Bell size={17} />
                {device ? "Disconnect this device" : "Enable on this device"}
              </button>
            </div>
            <label className="toggle-row">
              <span>
                <b>Keep reminder details private</b>
                <small>
                  Hide debt names and amounts in emails and notifications.
                </small>
              </span>
              <input
                type="checkbox"
                checked={p.private_content}
                onChange={(e) => update("private_content", e.target.checked)}
              />
            </label>
          </section>
          <button className="primary" disabled={busy || authBusy}>
            {busy ? "Saving…" : "Save preferences"}
          </button>
        </form>
        <div className="stack">
          <section className="panel form-section">
            <h2>Your security</h2>
            <form onSubmit={changePassword}>
              <Field label="New password" hint="At least 12 characters.">
                <input
                  required
                  type="password"
                  minLength={12}
                  maxLength={1024}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <button className="ghost" disabled={authBusy || demo}>
                Update password
              </button>
            </form>
            <MfaSettings demo={demo} />
          </section>
          <section className="panel form-section">
            <h2>Take SettleUp with you.</h2>
            <p className="muted">
              Install the PWA for an app-like experience. Your account stays in
              sync when you sign in.
            </p>
            <button className="secondary" onClick={() => void onInstall()}>
              <Download size={17} />
              Install app
            </button>
          </section>
          <section className="panel form-section">
            <h2>Help &amp; information</h2>
            <p className="small muted">
              SettleUp is in public beta. Share feedback with
              support@settleupapp.cloud.
            </p>
            <div className="row wrap">
              <a href="/help">Help &amp; support</a>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
            </div>
          </section>
          <section className="panel form-section">
            <h2>Your data, your choice.</h2>
            <p className="muted">
              Export debts, payments, preferences, and reminders.
            </p>
            <button className="ghost" onClick={exportData}>
              <Download size={17} />
              Export my data
            </button>
            <button
              className="danger text-button"
              disabled={demo}
              onClick={() => open({ type: "delete-account" })}
            >
              Delete my account
            </button>
          </section>
          <button className="ghost" onClick={() => void onSignOut()}>
            <LogOut size={18} />
            {demo ? "Leave demo" : "Sign out"}
          </button>
          <p className="muted small">
            SettleUp · PWA v0.2.0 beta
            <br />
            Amounts in USD. Payments are made with your lender.
          </p>
        </div>
      </div>
    </>
  );
}
function MfaSettings({ demo }: { demo: boolean }) {
  const { toast } = useUI();
  const [factor, setFactor] = useState<{
      id: string;
      qr: string;
      secret: string;
    } | null>(null),
    [existing, setExisting] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!demo)
      void supabase!.auth.mfa
        .listFactors()
        .then(({ data }) =>
          setExisting(
            data?.totp.find((f) => f.status === "verified")?.id || "",
          ),
        );
  }, [demo]);
  async function enroll() {
    setBusy(true);
    try {
      const { data, error } = await supabase!.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "SettleUp authenticator",
      });
      if (error) throw error;
      setFactor({
        id: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase!.auth.mfa.challengeAndVerify({
        factorId: factor!.id,
        code,
      });
      if (error) throw error;
      setExisting(factor!.id);
      setFactor(null);
      setCode("");
      toast("Two-step verification is enabled.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    try {
      const { error } = await supabase!.auth.mfa.unenroll({
        factorId: existing,
      });
      if (error) throw error;
      setExisting("");
      toast("Two-step verification removed.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mfa-section">
      <h3>Two-step verification</h3>
      <p className="small muted">
        Protect your account with an authenticator app.
      </p>
      {existing ? (
        <>
          <p className="success">Enabled</p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void disable()}
          >
            Remove authenticator
          </button>
        </>
      ) : factor ? (
        <form onSubmit={verify}>
          <img
            className="qr"
            src={factor.qr}
            alt="Authenticator setup QR code"
          />
          <details>
            <summary>Use a setup key instead</summary>
            <code className="setup-key">{factor.secret}</code>
          </details>
          <Field label="Authenticator code">
            <input
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <button className="secondary" disabled={busy}>
            Confirm setup
          </button>
        </form>
      ) : (
        <button
          className="ghost"
          disabled={demo || busy}
          onClick={() => void enroll()}
        >
          Set up authenticator
        </button>
      )}
      <ErrorText text={error} />
    </div>
  );
}
function ModalBody({ value, close }: { value: ModalState; close: () => void }) {
  switch (value.type) {
    case "payment":
      return <PaymentForm id={value.id!} close={close} />;
    case "reminder":
      return <ReminderForm id={value.id!} close={close} />;
    case "edit":
      return <EditDebt id={value.id!} close={close} />;
    case "delete":
      return <DeleteDebt id={value.id!} close={close} />;
    case "history":
      return <History id={value.id!} />;
    case "installment":
      return <EditInstallment id={value.id!} close={close} />;
    case "delete-account":
      return <DeleteAccount close={close} />;
  }
}
function PaymentForm({ id, close }: { id: string; close: () => void }) {
  const { s, act, busy, toast, day } = useUI();
  const i = s.installments.find((i) => i.id === id)!,
    d = s.debts.find((d) => d.id === i.debt_id)!;
  const [requestId] = useState(() => crypto.randomUUID()),
    [amount, setAmount] = useState((remaining(s, i) / 100).toFixed(2)),
    [date, setDate] = useState(day),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const cents = toCents(amount);
      validatePayment(s, id, cents, date);
      await act("mark_paid", {
        p_id: requestId,
        p_installment: id,
        p_amount: cents,
        p_date: date,
      });
      toast("Payment saved. One step closer.");
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form onSubmit={submit}>
      <p className="muted">
        {d.name} · Due {formatDate(i.due_date)}
      </p>
      <div className="notice small">
        Make your payment with your lender first. This updates your SettleUp
        tracker.
      </div>
      <Field
        label="Amount paid ($)"
        hint={`${money(remaining(s, i))} remaining on this installment.`}
      >
        <input
          required
          inputMode="decimal"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Field label="Payment date">
        <DateInput
          required
          min="1900-01-01"
          max={day}
          value={date}
          onInput={(e) => setDate(e.currentTarget.value)}
        />
      </Field>
      <ErrorText text={error} />
      <div className="modal-actions">
        <button type="button" className="ghost" disabled={busy} onClick={close}>
          Cancel
        </button>
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save payment"}
        </button>
      </div>
    </form>
  );
}
function ReminderForm({ id, close }: { id: string; close: () => void }) {
  const { s, email, demo, busy, act, toast } = useUI();
  const i = s.installments.find((i) => i.id === id)!,
    d = s.debts.find((d) => d.id === i.debt_id)!;
  const current = s.reminders.filter(
    (r) => r.installment_id === id && r.active,
  );
  const [channels, setChannels] = useState<Channel[]>(
    current.length
      ? [...new Set(current.map((r) => r.channel))]
      : s.profile.email_enabled
        ? ["email"]
        : s.profile.push_enabled
          ? ["push"]
          : [],
  );
  const [offsets, setOffsets] = useState<number[]>(
      current.length ? [...new Set(current.map((r) => r.days_before))] : [1],
    ),
    [time, setTime] = useState(current[0]?.send_time.slice(0, 5) || "09:00"),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (!channels.length)
        throw new Error("Choose email, notifications, or both.");
      if (channels.includes("email") && !s.profile.email_enabled)
        throw new Error("Enable email reminders in Settings first.");
      if (channels.includes("push") && !s.profile.push_enabled)
        throw new Error("Enable notifications in Settings first.");
      if (!offsets.length) throw new Error("Choose at least one reminder day.");
      await act("set_reminders", {
        p_installment: id,
        p_channels: channels,
        p_offsets: offsets,
        p_time: time,
      });
      toast(
        demo
          ? "Reminder saved in demo. No message will be sent."
          : "Reminder scheduled.",
      );
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form onSubmit={submit}>
      <p className="muted">
        {d.name} · {money(remaining(s, i))} due {formatDate(i.due_date)}
      </p>
      <fieldset className="channel-options">
        <legend>Send my reminder by</legend>
        {(["email", "push"] as Channel[]).map((channel) => {
          const enabled =
            channel === "email"
              ? s.profile.email_enabled
              : s.profile.push_enabled;
          return (
            <label className="checkbox-row" key={channel}>
              <input
                type="checkbox"
                disabled={!enabled}
                checked={channels.includes(channel)}
                onChange={(e) =>
                  setChannels(
                    e.target.checked
                      ? [...channels, channel]
                      : channels.filter((c) => c !== channel),
                  )
                }
              />
              <span>
                <b>{channelLabel(channel)}</b>
                <small>
                  {channel === "email" ? email : "Your connected devices"}
                  {!enabled ? " · Enable in Settings" : ""}
                </small>
              </span>
            </label>
          );
        })}
      </fieldset>
      <fieldset>
        <legend>When would you like a nudge?</legend>
        <div className="offset-options">
          {[7, 3, 1, 0].map((n) => (
            <label key={n} className={offsets.includes(n) ? "selected" : ""}>
              <input
                type="checkbox"
                checked={offsets.includes(n)}
                onChange={(e) =>
                  setOffsets(
                    e.target.checked
                      ? [...offsets, n]
                      : offsets.filter((x) => x !== n),
                  )
                }
              />
              {n ? `${n} ${n === 1 ? "day" : "days"} before` : "On due date"}
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label="Send at"
        hint={`Time zone: ${s.profile.timezone}. Past reminder times are skipped.`}
      >
        <input
          required
          type="time"
          value={time}
          onInput={(e) => setTime(e.currentTarget.value)}
        />
      </Field>
      {current.length > 0 && (
        <p className="small muted">
          Saving replaces this installment’s existing reminder schedule.
        </p>
      )}
      <ErrorText text={error} />
      <div className="modal-actions">
        <button type="button" className="ghost" onClick={close} disabled={busy}>
          Cancel
        </button>
        <button className="primary" disabled={busy || !channels.length}>
          {busy ? "Scheduling…" : "Save reminder"}
        </button>
      </div>
    </form>
  );
}
function EditDebt({ id, close }: { id: string; close: () => void }) {
  const { s, busy, act, toast } = useUI(),
    d = s.debts.find((d) => d.id === id)!;
  const [name, setName] = useState(d.name),
    [lender, setLender] = useState(d.lender),
    [category, setCategory] = useState(d.category),
    [notes, setNotes] = useState(d.notes),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await act("update_debt", {
        p_id: id,
        p_name: name,
        p_lender: lender,
        p_category: category,
        p_notes: notes,
      });
      toast("Debt details updated.");
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form onSubmit={submit}>
      <Field label="Debt name">
        <input
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Lender or store">
        <input
          maxLength={120}
          value={lender}
          onChange={(e) => setLender(e.target.value)}
        />
      </Field>
      <Field label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categoryOptions.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Notes">
        <textarea
          maxLength={2000}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <ErrorText text={error} />
      <button className="primary full" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
function EditInstallment({ id, close }: { id: string; close: () => void }) {
  const { s, busy, act, toast } = useUI(),
    i = s.installments.find((i) => i.id === id)!;
  const [date, setDate] = useState(i.due_date),
    [amount, setAmount] = useState((i.amount_cents / 100).toFixed(2)),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const cents = toCents(amount);
      if (cents < Math.max(1, paidFor(s, id)))
        throw new Error("The amount cannot be less than recorded payments.");
      await act("edit_installment", {
        p_id: id,
        p_date: date,
        p_amount: cents,
      });
      toast("Installment updated. Set a new reminder if needed.");
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form onSubmit={submit}>
      <p className="muted">
        Changing an installment updates the debt total and cancels its pending
        reminders.
      </p>
      <Field label="Due date">
        <DateInput
          required
          min="1900-01-01"
          max="2200-12-31"
          value={date}
          onInput={(e) => setDate(e.currentTarget.value)}
        />
      </Field>
      <Field
        label="Installment amount ($)"
        hint={`${money(paidFor(s, id))} already recorded as paid.`}
      >
        <input
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <ErrorText text={error} />
      <button className="primary full" disabled={busy}>
        Save installment
      </button>
    </form>
  );
}
function DeleteDebt({ id, close }: { id: string; close: () => void }) {
  const { s, busy, act, go, toast } = useUI(),
    d = s.debts.find((d) => d.id === id)!;
  const [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  async function remove() {
    try {
      await act("delete_debt", { p_id: id });
      toast("Debt deleted.");
      close();
      go("debts");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <p>
        Deleting <b>{d.name}</b> removes its installments, payment history, and
        reminders. This cannot be undone.
      </p>
      <label className="consent">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I understand and want to delete this debt.
      </label>
      <ErrorText text={error} />
      <div className="modal-actions">
        <button className="ghost" onClick={close} disabled={busy}>
          Keep debt
        </button>
        <button
          className="danger-button"
          disabled={busy || !confirmed}
          onClick={() => void remove()}
        >
          Delete debt
        </button>
      </div>
    </>
  );
}
function History({ id }: { id: string }) {
  const { s, busy, act, toast } = useUI(),
    rows = s.payments
      .filter((p) => p.installment_id === id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [confirm, setConfirm] = useState("");
  async function reverse(id: string) {
    try {
      await act("reverse_payment", { p_id: id });
      setConfirm("");
      toast(
        "Payment reversed. Cancelled reminders are not restored automatically.",
      );
    } catch (e) {
      toast((e as Error).message);
    }
  }
  return (
    <>
      {rows.length ? (
        rows.map((p) => (
          <article className="history-row" key={p.id}>
            <div className="row between">
              <b>{money(p.amount_cents)}</b>
              <span className={`pill ${p.reversed_at ? "" : "green"}`}>
                {p.reversed_at ? "Reversed" : "Recorded"}
              </span>
            </div>
            <p className="muted small">Paid {formatDate(p.paid_on)}</p>
            {!p.reversed_at &&
              (confirm === p.id ? (
                <div className="notice">
                  <p>
                    This adds {money(p.amount_cents)} back to the amount due.
                  </p>
                  <button
                    className="danger-button"
                    disabled={busy}
                    onClick={() => void reverse(p.id)}
                  >
                    Confirm reversal
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setConfirm("")}
                  >
                    Keep payment
                  </button>
                </div>
              ) : (
                <button
                  className="text-button danger"
                  onClick={() => setConfirm(p.id)}
                >
                  Correct / reverse payment
                </button>
              ))}
          </article>
        ))
      ) : (
        <Empty
          title="No payments yet."
          text="Your recorded payments will appear here."
        />
      )}
    </>
  );
}
function DeleteAccount({ close }: { close: () => void }) {
  const { demo, toast } = useUI();
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function remove(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (demo) throw new Error("There is no real account in the demo.");
      const { data, error } = await supabase!.functions.invoke("account", {
        body: { action: "delete", password },
      });
      if (error || data?.error)
        throw new Error(
          data?.error ||
            "Could not delete your account. Check your password and try again.",
        );
      await supabase!.auth.signOut({ scope: "local" });
      toast("Your account and its tracked data have been deleted.");
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={remove}>
      <p>
        This permanently deletes your account, debts, payments, reminder
        schedules, and devices. Export your data first if you want a copy.
      </p>
      <Field label="Confirm your password">
        <input
          required
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <label className="consent">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
        />
        I understand that account deletion cannot be undone.
      </label>
      <ErrorText text={error} />
      <button className="danger-button full" disabled={!confirm || busy}>
        {busy ? "Deleting…" : "Permanently delete account"}
      </button>
    </form>
  );
}

function MfaChallenge({
  factorId,
  onDone,
  onSignOut,
}: {
  factorId: string;
  onDone: () => void;
  onSignOut: () => Promise<void>;
}) {
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase!.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (error) throw error;
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="loading">
      <Brand />
      <section
        className="panel form-section"
        style={{ width: "min(100%,420px)" }}
      >
        <h1>One more little step.</h1>
        <p className="muted">
          Enter the six-digit code from your authenticator app.
        </p>
        <form onSubmit={verify}>
          <Field label="Authenticator code">
            <input
              autoFocus
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <ErrorText text={error} />
          <button className="primary full" disabled={busy}>
            {busy ? "Verifying…" : "Verify and continue"}
          </button>
        </form>
        <button className="text-button" onClick={() => void onSignOut()}>
          Sign out
        </button>
      </section>
    </main>
  );
}
