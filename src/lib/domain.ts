import { Temporal } from "@js-temporal/polyfill";
export type Channel = "email" | "push";
export type Theme = "light" | "dark" | "system";
export interface Profile {
  id: string;
  display_name: string;
  timezone: string;
  theme: Theme;
  private_content: boolean;
  sms_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  consent_phone?: string;
}
export interface Debt {
  id: string;
  name: string;
  lender: string;
  category: string;
  notes: string;
  total_cents: number;
  created_at: string;
}
export interface Installment {
  id: string;
  debt_id: string;
  due_date: string;
  amount_cents: number;
}
export interface Payment {
  id: string;
  installment_id: string;
  amount_cents: number;
  paid_on: string;
  created_at: string;
  reversed_at: string | null;
}
export interface Reminder {
  id: string;
  installment_id: string;
  channel: Channel;
  days_before: number;
  send_time: string;
  scheduled_at: string;
  state: string;
  error_code: string | null;
  provider_id?: string;
  active: boolean;
}
export interface Snapshot {
  debts: Debt[];
  installments: Installment[];
  payments: Payment[];
  reminders: Reminder[];
  profile: Profile;
}
export const MAX_CENTS = 1_000_000_000;
export function toCents(value: string): number {
  const text = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw new Error("Enter an amount with up to two decimal places.");
  const [whole, fraction = ""] = text.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > MAX_CENTS)
    throw new Error("The maximum amount is $10,000,000.");
  return result;
}
export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
export const today = (
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) => Temporal.Now.plainDateISO(timezone).toString();
export const addDays = (date: string, days: number) =>
  Temporal.PlainDate.from(date).add({ days }).toString();
export const formatDate = (value: string, long = false) =>
  Temporal.PlainDate.from(value).toLocaleString("en-US", {
    month: long ? "long" : "short",
    day: "numeric",
    year: "numeric",
  });
export const paidFor = (s: Snapshot, installmentId: string) =>
  s.payments
    .filter((p) => p.installment_id === installmentId && !p.reversed_at)
    .reduce((n, p) => n + p.amount_cents, 0);
export const remaining = (s: Snapshot, i: Installment) =>
  i.amount_cents - paidFor(s, i.id);
export const debtItems = (s: Snapshot, id: string) =>
  s.installments
    .filter((i) => i.debt_id === id)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
export const balance = (s: Snapshot, id?: string) =>
  s.installments
    .filter((i) => !id || i.debt_id === id)
    .reduce((n, i) => n + remaining(s, i), 0);
export const progress = (s: Snapshot, d: Debt) =>
  balance(s, d.id) === 0
    ? 100
    : Math.min(
        99,
        Math.floor(((d.total_cents - balance(s, d.id)) / d.total_cents) * 100),
      );
export type Period = "week" | "month" | "next" | "all";
export function inPeriod(due: string, period: Period, day: string) {
  const d = Temporal.PlainDate.from(day);
  let start = d;
  let end = d;
  if (period === "all") return true;
  if (period === "week") {
    start = d.subtract({ days: d.dayOfWeek - 1 });
    end = start.add({ days: 7 });
  }
  if (period === "month") {
    start = d.with({ day: 1 });
    end = start.add({ months: 1 });
  }
  if (period === "next") {
    start = d.with({ day: 1 }).add({ months: 1 });
    end = start.add({ months: 1 });
  }
  return due >= start.toString() && due < end.toString();
}
export function periodInfo(s: Snapshot, period: Period, day: string) {
  const scheduled = s.installments.filter((i) =>
    inPeriod(i.due_date, period, day),
  );
  return {
    scheduled,
    outstanding: scheduled.filter((i) => remaining(s, i) > 0),
    total: scheduled.reduce((n, i) => n + remaining(s, i), 0),
  };
}
export function emptyCopy(s: Snapshot, period: Period, day: string) {
  const label =
    period === "week"
      ? "this week"
      : period === "next"
        ? "next month"
        : period === "month"
          ? "this month"
          : "on your schedule";
  if (!s.debts.length)
    return {
      title: "A fresh start, a clear picture.",
      text: "Add your first debt to see every payment in one place.",
    };
  if (!balance(s))
    return {
      title: "Every tracked debt, completed.",
      text: "You’ve paid off all the debts in SettleUp. That’s a milestone.",
    };
  const overdue = s.installments.filter(
    (i) => i.due_date < day && remaining(s, i) > 0,
  );
  if (overdue.length)
    return {
      title: `Nothing else due ${label}.`,
      text: `You still have ${money(overdue.reduce((n, i) => n + remaining(s, i), 0))} in overdue payments to review.`,
    };
  if (periodInfo(s, period, day).scheduled.length)
    return {
      title: `Hooray! You’re all paid up ${label}.`,
      text: "A little breathing room. Your next payment is shown below.",
    };
  return {
    title: `Nothing due ${label}.`,
    text: "There are no payments scheduled for this period. Enjoy a little breathing room.",
  };
}
export function splitSchedule(
  total: number,
  count: number,
  start: string,
  frequency: "weekly" | "biweekly" | "monthly",
) {
  if (
    !Number.isSafeInteger(total) ||
    total < 1 ||
    total > MAX_CENTS ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 120 ||
    count > total
  )
    throw new Error("Choose 1–120 installments, each worth at least one cent.");
  const anchor = Temporal.PlainDate.from(start);
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => ({
    due_date: (frequency === "monthly"
      ? anchor.add({ months: index })
      : anchor.add({ days: index * (frequency === "weekly" ? 7 : 14) })
    ).toString(),
    amount_cents: base + (index === count - 1 ? total - base * count : 0),
  }));
}
export function validateSchedule(
  total: number,
  rows: Pick<Installment, "due_date" | "amount_cents">[],
) {
  if (
    !Number.isSafeInteger(total) ||
    total < 1 ||
    total > MAX_CENTS ||
    !rows.length ||
    rows.length > 120
  )
    throw new Error("Add between 1 and 120 installments and a positive total.");
  for (const row of rows) {
    Temporal.PlainDate.from(row.due_date);
    if (
      !Number.isSafeInteger(row.amount_cents) ||
      row.amount_cents < 1 ||
      row.amount_cents > MAX_CENTS
    )
      throw new Error("Every installment needs a positive amount.");
  }
  if (rows.reduce((n, r) => n + r.amount_cents, 0) !== total)
    throw new Error("The installment amounts must add up to the debt total.");
}
export function validatePayment(
  s: Snapshot,
  installmentId: string,
  amount: number,
  paidOn: string,
) {
  const i = s.installments.find((x) => x.id === installmentId);
  if (!i) throw new Error("This installment no longer exists.");
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining(s, i))
    throw new Error(
      "Enter an amount between $0.01 and the remaining installment balance.",
    );
  if (Temporal.PlainDate.compare(paidOn, today(s.profile.timezone)) > 0)
    throw new Error("A payment date cannot be in the future.");
}
export function reminderAt(
  dueDate: string,
  offset: number,
  time: string,
  timezone: string,
) {
  return Temporal.PlainDate.from(dueDate)
    .subtract({ days: offset })
    .toPlainDateTime(Temporal.PlainTime.from(time))
    .toZonedDateTime(timezone, { disambiguation: "later" })
    .toInstant()
    .toString();
}
