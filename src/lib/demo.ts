import { addDays, today, type Snapshot } from "./domain";
export function demoSnapshot(): Snapshot {
  const day = today();
  const s: Snapshot = {
    profile: {
      id: "demo",
      display_name: "Alex",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      theme: "system",
      private_content: true,
      sms_enabled: false,
      email_enabled: true,
      push_enabled: false,
    },
    debts: [],
    installments: [],
    payments: [],
    reminders: [],
  };
  const plans = [
    ["Amazon iPad purchase", "Amazon", "Shopping", 20000, 4, 0, 3, 14],
    ["Car payment", "Auto lender", "Auto", 240000, 6, 3, -80, 30],
    ["Living room furniture", "Furniture store", "Home", 72000, 6, 2, -25, 14],
    ["Dental care", "Dental office", "Health", 60000, 6, 2, -32, 14],
    ["Personal loan", "Personal lender", "Personal", 120000, 8, 4, -48, 14],
    [
      "Laptop accessories",
      "Electronics store",
      "Shopping",
      18000,
      3,
      3,
      -60,
      14,
    ],
  ] as const;
  for (const [
    name,
    lender,
    category,
    total,
    count,
    paid,
    offset,
    gap,
  ] of plans) {
    const id = crypto.randomUUID();
    s.debts.push({
      id,
      name,
      lender,
      category,
      total_cents: total,
      notes: "",
      created_at: new Date().toISOString(),
    });
    for (let j = 0; j < count; j++) {
      const iid = crypto.randomUUID();
      const due = addDays(day, offset + j * gap);
      s.installments.push({
        id: iid,
        debt_id: id,
        due_date: due,
        amount_cents: total / count,
      });
      if (j < paid)
        s.payments.push({
          id: crypto.randomUUID(),
          installment_id: iid,
          amount_cents: total / count,
          paid_on: due,
          created_at: new Date().toISOString(),
          reversed_at: null,
        });
    }
  }
  return s;
}
