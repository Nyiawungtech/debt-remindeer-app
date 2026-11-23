import { describe, it, expect } from "vitest";
import {
  balance,
  emptyCopy,
  inPeriod,
  paidFor,
  progress,
  reminderAt,
  splitSchedule,
  toCents,
  validatePayment,
  validateSchedule,
} from "../src/lib/domain";
import { demoSnapshot } from "../src/lib/demo";
describe("money and schedules", () => {
  it("uses exact decimal cents and rejects exponents, negatives, fractions and excessive amounts", () => {
    expect(toCents("0.29")).toBe(29);
    expect(toCents("10000000")).toBe(1000000000);
    for (const v of ["1e3", "-5", "2.001", "Infinity", "10000000.01", ""])
      expect(() => toCents(v)).toThrow();
  });
  it("preserves the total when equal installments need rounding", () => {
    const rows = splitSchedule(10000, 3, "2026-12-01", "biweekly");
    expect(rows.map((r) => r.amount_cents)).toEqual([3333, 3333, 3334]);
    expect(rows[2].due_date).toBe("2026-12-29");
    validateSchedule(10000, rows);
  });
  it("anchors monthly payments instead of drifting after February", () => {
    expect(
      splitSchedule(40000, 4, "2028-01-31", "monthly").map((r) => r.due_date),
    ).toEqual(["2028-01-31", "2028-02-29", "2028-03-31", "2028-04-30"]);
  });
  it("rejects invalid schedules and fractions of a cent", () => {
    expect(() => splitSchedule(2, 3, "2026-01-01", "weekly")).toThrow();
    expect(() =>
      validateSchedule(100, [{ due_date: "2026-12-01", amount_cents: 99 }]),
    ).toThrow();
    expect(() =>
      validateSchedule(100, [{ due_date: "2026-02-30", amount_cents: 100 }]),
    ).toThrow();
  });
  it("includes the complete Monday-Sunday week across year boundaries", () => {
    expect(inPeriod("2026-12-28", "week", "2027-01-01")).toBe(true);
    expect(inPeriod("2027-01-03", "week", "2027-01-01")).toBe(true);
    expect(inPeriod("2027-01-04", "week", "2027-01-01")).toBe(false);
    expect(inPeriod("2027-01-01", "next", "2026-12-29")).toBe(true);
  });
  it("computes progress by money and handles reversal", () => {
    const s = demoSnapshot();
    const d = s.debts[0],
      i = s.installments.find((i) => i.debt_id === d.id)!;
    s.payments.push({
      id: "partial",
      installment_id: i.id,
      amount_cents: 2500,
      paid_on: i.due_date,
      created_at: "",
      reversed_at: null,
    });
    expect(paidFor(s, i.id)).toBe(2500);
    expect(balance(s, d.id)).toBe(17500);
    expect(progress(s, d)).toBe(12);
    s.payments.at(-1)!.reversed_at = "now";
    expect(balance(s, d.id)).toBe(20000);
  });
  it("prevents overpaying and future-dated payments", () => {
    const s = demoSnapshot(),
      i = s.installments[0];
    expect(() => validatePayment(s, i.id, 5001, "2026-01-01")).toThrow();
    expect(() => validatePayment(s, i.id, 100, "2199-01-01")).toThrow();
  });
  it("does not celebrate when no payments were scheduled or account has no debts", () => {
    const s = demoSnapshot();
    s.debts = [];
    s.installments = [];
    s.payments = [];
    expect(emptyCopy(s, "month", "2026-12-01").title).toBe(
      "A fresh start, a clear picture.",
    );
    const x = demoSnapshot();
    expect(emptyCopy(x, "month", "2199-12-01").title).not.toContain("Hooray");
  });
  it("schedules in the account timezone including DST gaps and overlaps", () => {
    expect(reminderAt("2027-03-14", 0, "02:30", "America/New_York")).toBe(
      "2027-03-14T07:30:00Z",
    );
    expect(reminderAt("2026-11-01", 0, "01:30", "America/New_York")).toBe(
      "2026-11-01T06:30:00Z",
    );
    expect(reminderAt("2027-01-01", 1, "09:00", "America/New_York")).toBe(
      "2026-12-31T14:00:00Z",
    );
  });
});
