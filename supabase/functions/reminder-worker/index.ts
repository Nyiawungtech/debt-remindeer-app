import {
  admin,
  env,
  json,
  secureEqual,
  deliveryConfig,
} from "../_shared/common.ts";
import {
  DeliveryError,
  sendReminderEmail,
  type EmailPayload,
} from "../_shared/email.ts";
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!req.headers.get("x-worker-secret"))
    return json({ error: "Unauthorized" }, 401);
  const db = admin();
  let config: Record<string, string>;
  try {
    config = await deliveryConfig(db);
  } catch {
    return json({ error: "Delivery settings unavailable" }, 503);
  }
  const get = (name: string) => env(name, config);
  if (
    !(await secureEqual(
      req.headers.get("x-worker-secret") || "",
      get("WORKER_SECRET"),
    ))
  )
    return json({ error: "Unauthorized" }, 401);
  const { data: jobs, error } = await db.rpc("claim_reminders", {
    p_limit: 25,
  });
  if (error) return json({ error: "Could not claim reminder jobs" }, 500);
  const result = { accepted: 0, skipped: 0, failed: 0 };
  for (const job of jobs || []) {
    let provider: string | null = null;
    try {
      const { data, error: payloadError } = await db.rpc("reminder_payload", {
        p_id: job.id,
      });
      if (payloadError) throw new DeliveryError("eligibility_check_failed");
      const p = data as EmailPayload | null;
      if (!p || p.channel !== "email") {
        await db.rpc("finish_reminder", {
          p_id: job.id,
          p_state: "skipped",
          p_error: "no_longer_eligible",
        });
        result.skipped++;
        continue;
      }
      if (
        ["RESEND_API_KEY", "EMAIL_FROM"].some(
          (name) => !(Deno.env.get(name) || config[name]),
        )
      )
        throw new DeliveryError("email_not_configured");
      provider = await sendReminderEmail(job.id, p, {
        apiKey: get("RESEND_API_KEY"),
        from: get("EMAIL_FROM"),
        appUrl: get("APP_URL"),
      });
      const { error: finishError } = await db.rpc("finish_reminder", {
        p_id: job.id,
        p_state: "accepted",
        p_provider: provider,
      });
      if (finishError) throw new DeliveryError("delivery_uncertain");
      result.accepted++;
    } catch (e) {
      const known = e instanceof DeliveryError;
      await db.rpc("finish_reminder", {
        p_id: job.id,
        p_state: "failed",
        p_error: known ? e.code : "delivery_uncertain",
        p_retry: known && e.retry,
      });
      result.failed++;
    }
  }
  return json(result);
});
