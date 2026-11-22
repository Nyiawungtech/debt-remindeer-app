import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { rpc, supabase } from "./client";
import { demoSnapshot } from "./demo";
import {
  remaining,
  reminderAt,
  type Snapshot,
  type Profile,
  type Channel,
} from "./domain";
import { collectPages } from "./pagination";
async function fetchSnapshot(): Promise<Snapshot> {
  const profile = await rpc<Profile>("ensure_profile");
  const tables = ["debts", "installments", "payments", "reminders"] as const;
  const results = await Promise.all(
    tables.map((table) =>
      collectPages(async (after) => {
        let query = supabase!.from(table).select("*").order("id").limit(1000);
        if (after) query = query.gt("id", after);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data || [];
      }),
    ),
  );

  return {
    profile,
    debts: results[0],
    installments: results[1],
    payments: results[2],
    reminders: results[3],
  } as Snapshot;
}
export function useWorkspace(session: Session | null, demo: boolean) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      if (demo) {
        setData((previous) => previous || demoSnapshot());
        return;
      }
      if (!session) {
        setData(null);
        return;
      }
      const result = await fetchSnapshot();
      if (current === generation.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    }
  }, [session?.user.id, demo]);
  useEffect(() => {
    setData(null);
    setError("");
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  useEffect(() => {
    if (!session || demo) return;
    const refreshVisible = () => {
      if (!document.hidden && !lock.current) void refresh();
    };
    const interval = setInterval(refreshVisible, 60000);
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("online", refreshVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("online", refreshVisible);
    };
  }, [refresh, session, demo]);
  async function act(name: string, args: Record<string, unknown>) {
    if (lock.current)
      throw new Error("Please wait for the current change to finish.");
    lock.current = true;
    setBusy(true);
    try {
      if (!demo) {
        await rpc(name, args);
        await refresh();
        return;
      }
      if (!data) throw new Error("Your workspace is loading.");
      const next = structuredClone(data);
      const a = args as Record<string, any>;
      const now = new Date().toISOString();
      switch (name) {
        case "create_debt": {
          if (next.debts.some((d) => d.id === a.p_id)) break;
          next.debts.push({
            id: a.p_id,
            name: a.p_name,
            lender: a.p_lender,
            category: a.p_category,
            notes: a.p_notes,
            total_cents: a.p_total,
            created_at: now,
          });
          next.installments.push(
            ...a.p_schedule.map((i: any) => ({
              ...i,
              id: crypto.randomUUID(),
              debt_id: a.p_id,
            })),
          );
          break;
        }
        case "update_debt": {
          const d = next.debts.find((d) => d.id === a.p_id)!;
          Object.assign(d, {
            name: a.p_name,
            lender: a.p_lender,
            category: a.p_category,
            notes: a.p_notes,
          });
          break;
        }
        case "delete_debt": {
          const ids = next.installments
            .filter((i) => i.debt_id === a.p_id)
            .map((i) => i.id);
          next.debts = next.debts.filter((d) => d.id !== a.p_id);
          next.installments = next.installments.filter(
            (i) => !ids.includes(i.id),
          );
          next.payments = next.payments.filter(
            (p) => !ids.includes(p.installment_id),
          );
          next.reminders = next.reminders.filter(
            (r) => !ids.includes(r.installment_id),
          );
          break;
        }
        case "mark_paid": {
          const i = next.installments.find((i) => i.id === a.p_installment)!;
          if (a.p_amount < 1 || a.p_amount > remaining(next, i))
            throw new Error("Payment exceeds the remaining balance.");
          if (next.payments.some((p) => p.id === a.p_id)) break;
          next.payments.push({
            id: a.p_id,
            installment_id: i.id,
            amount_cents: a.p_amount,
            paid_on: a.p_date,
            created_at: now,
            reversed_at: null,
          });
          if (!remaining(next, i))
            for (const r of next.reminders)
              if (r.installment_id === i.id && r.state === "pending") {
                r.state = "cancelled";
                r.active = false;
              }
          break;
        }
        case "reverse_payment":
          next.payments.find((p) => p.id === a.p_id)!.reversed_at = now;
          break;
        case "edit_installment": {
          const i = next.installments.find((i) => i.id === a.p_id)!;
          const paid = i.amount_cents - remaining(next, i);
          if (a.p_amount < Math.max(1, paid))
            throw new Error(
              "The amount cannot be less than its recorded payments.",
            );
          next.debts.find((d) => d.id === i.debt_id)!.total_cents +=
            a.p_amount - i.amount_cents;
          i.amount_cents = a.p_amount;
          i.due_date = a.p_date;
          for (const r of next.reminders)
            if (r.installment_id === i.id && r.state === "pending") {
              r.state = "cancelled";
              r.active = false;
            }
          break;
        }
        case "save_preferences":
          Object.assign(next.profile, {
            display_name: a.p_name,
            timezone: a.p_timezone,
            theme: a.p_theme,
            private_content: a.p_private,
            email_enabled: a.p_email,
            sms_enabled: a.p_sms,
            push_enabled: a.p_push,
          });
          break;
        case "set_reminders": {
          const i = next.installments.find((i) => i.id === a.p_installment)!;
          const rows = [];
          for (const c of a.p_channels as Channel[])
            for (const offset of a.p_offsets as number[]) {
              const at = reminderAt(
                i.due_date,
                offset,
                a.p_time,
                next.profile.timezone,
              );
              if (at > now)
                rows.push({
                  id: crypto.randomUUID(),
                  installment_id: i.id,
                  channel: c,
                  days_before: offset,
                  send_time: a.p_time,
                  scheduled_at: at,
                  state: "pending",
                  error_code: null,
                  active: true,
                });
            }
          if (!rows.length)
            throw new Error(
              "All selected reminder times have passed. Choose a later time.",
            );
          for (const r of next.reminders)
            if (r.installment_id === i.id) {
              r.active = false;
              if (r.state === "pending") r.state = "cancelled";
            }
          next.reminders.push(...rows);
          break;
        }
        case "cancel_reminder": {
          const r = next.reminders.find((r) => r.id === a.p_id)!;
          r.state = "cancelled";
          r.active = false;
          break;
        }
        default:
          throw new Error("This action needs a connected account.");
      }
      setData(next);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { data, error, busy, refresh, act };
}
