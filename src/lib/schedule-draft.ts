import { MAX_CENTS, scheduleDates, toCents, validateSchedule } from "./domain";

export type DraftInstallment = { due_date: string; amount: string };
export type ScheduleFrequency = "weekly" | "biweekly" | "monthly";

export function generateScheduleDraft(
  count: number,
  start: string,
  frequency: ScheduleFrequency,
  previous: DraftInstallment[] = [],
  eachAmount = "",
): DraftInstallment[] {
  const dates = scheduleDates(count, start, frequency);
  let amount: string | undefined;
  if (eachAmount.trim()) {
    const cents = toCents(eachAmount);
    if (cents < 1) throw new Error("Enter a positive installment amount.");
    if (cents * count > MAX_CENTS)
      throw new Error("The maximum total debt is $10,000,000.");
    amount = (cents / 100).toFixed(2);
  }
  return dates.map((due_date, index) => ({
    due_date,
    amount: amount ?? previous[index]?.amount ?? "",
  }));
}

export function draftSummary(rows: DraftInstallment[]) {
  let total = 0,
    missing = 0,
    error = "";
  for (const row of rows) {
    if (!row.amount.trim()) {
      missing++;
      continue;
    }
    try {
      const cents = toCents(row.amount);
      if (cents < 1)
        throw new Error("Every installment needs a positive amount.");
      total += cents;
    } catch (e) {
      error ||= (e as Error).message;
    }
  }
  if (total > MAX_CENTS) error = "The maximum total debt is $10,000,000.";
  return { total, missing, error };
}

export function debtScheduleFromDraft(rows: DraftInstallment[]) {
  const schedule = rows.map((row) => ({
    due_date: row.due_date,
    amount_cents: toCents(row.amount),
  }));
  const total = schedule.reduce((sum, row) => sum + row.amount_cents, 0);
  validateSchedule(total, schedule);
  return { total, schedule };
}
