import { expect, it } from "vitest";
import {
  debtScheduleFromDraft,
  draftSummary,
  generateScheduleDraft,
} from "../src/lib/schedule-draft";

it("generates dates before the debt total or installment amounts are known", () => {
  const rows = generateScheduleDraft(4, "2026-12-02", "biweekly");
  expect(rows.map((row) => row.due_date)).toEqual([
    "2026-12-02",
    "2026-12-16",
    "2026-12-30",
    "2027-01-13",
  ]);
  expect(rows.every((row) => row.amount === "")).toBe(true);
  expect(draftSummary(rows)).toEqual({ total: 0, missing: 4, error: "" });
});

it("creates the exact total and persistence schedule from unequal installment amounts", () => {
  const rows = generateScheduleDraft(3, "2026-12-02", "weekly").map(
    (row, index) => ({ ...row, amount: ["50.25", "49.75", "100"][index] }),
  );
  expect(draftSummary(rows).total).toBe(20000);
  const saved = debtScheduleFromDraft(rows);
  expect(saved.total).toBe(20000);
  expect(saved.schedule.map((row) => row.amount_cents)).toEqual([
    5025, 4975, 10000,
  ]);
  rows[1].amount = "40.01";
  expect(debtScheduleFromDraft(rows).total).toBe(19026);
});

it("fills equal amounts optionally and keeps exact decimal cents", () => {
  const rows = generateScheduleDraft(4, "2026-12-02", "biweekly", [], "50.25");
  expect(rows.map((row) => row.amount)).toEqual([
    "50.25",
    "50.25",
    "50.25",
    "50.25",
  ]);
  expect(debtScheduleFromDraft(rows).total).toBe(20100);
  expect(
    debtScheduleFromDraft(
      generateScheduleDraft(3, "2026-12-02", "weekly", [], "0.29"),
    ).total,
  ).toBe(87);
});

it("preserves entered amounts when regenerating dates and supports adding and removing rows", () => {
  const previous = [
    { due_date: "2026-01-01", amount: "10.25" },
    { due_date: "2026-01-02", amount: "20.75" },
  ];
  const rows = generateScheduleDraft(3, "2028-01-31", "monthly", previous);
  expect(rows.map((row) => row.due_date)).toEqual([
    "2028-01-31",
    "2028-02-29",
    "2028-03-31",
  ]);
  expect(rows.map((row) => row.amount)).toEqual(["10.25", "20.75", ""]);
  expect(draftSummary(rows)).toEqual({ total: 3100, missing: 1, error: "" });
  rows[2].amount = "4.25";
  expect(debtScheduleFromDraft(rows).total).toBe(3525);
  expect(debtScheduleFromDraft(rows.slice(1)).total).toBe(2500);
});

it("does not silently save partial, invalid, nonpositive or excessive amounts", () => {
  for (const amount of ["", "0", "-1", "1.001", "1e3", "10000000.01"]) {
    const rows = [{ due_date: "2026-12-02", amount }];
    expect(() => debtScheduleFromDraft(rows)).toThrow();
    if (amount) expect(draftSummary(rows).error).not.toBe("");
  }
  const tooLarge = generateScheduleDraft(2, "2026-12-02", "weekly").map(
    (row) => ({ ...row, amount: "6000000" }),
  );
  expect(draftSummary(tooLarge).error).toContain("maximum");
  expect(() => debtScheduleFromDraft(tooLarge)).toThrow();
  expect(() =>
    generateScheduleDraft(2, "2026-12-02", "weekly", [], "6000000"),
  ).toThrow("maximum");
});

it("rejects invalid configuration and out-of-range generated dates before replacing a draft", () => {
  for (const count of [0, 1.5, 121, NaN])
    expect(() =>
      generateScheduleDraft(count, "2026-12-02", "weekly"),
    ).toThrow();
  for (const start of ["", "2026-02-30", "1899-12-31"])
    expect(() => generateScheduleDraft(1, start, "weekly")).toThrow();
  expect(() => generateScheduleDraft(2, "2200-12-31", "monthly")).toThrow();
  expect(() =>
    debtScheduleFromDraft([{ due_date: "2026-02-30", amount: "10" }]),
  ).toThrow();
});
