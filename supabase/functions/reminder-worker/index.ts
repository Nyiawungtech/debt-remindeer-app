import * as webpush from "npm:web-push@4.0.0";
import {
  admin,
  env,
  json,
  secureEqual,
  deliveryConfig,
} from "../_shared/common.ts";
interface Payload {
  channel: string;
  email: string;
  phone: string;
  private_content: boolean;
  name: string;
  amount_cents: number;
  due_date: string;
  debt_id: string;
  subscriptions: {
    id: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }[];
}
class DeliveryError extends Error {
  constructor(
    public code: string,
    public retry = false,
  ) {
    super(code);
  }
}
const allowedPush =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
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
      const p = data as Payload | null;
      if (!p) {
        await db.rpc("finish_reminder", {
          p_id: job.id,
          p_state: "skipped",
          p_error: "no_longer_eligible",
        });
        result.skipped++;
        continue;
      }
      const required =
        p.channel === "sms"
          ? [
              "TWILIO_ACCOUNT_SID",
              "TWILIO_AUTH_TOKEN",
              "TWILIO_MESSAGING_SERVICE_SID",
              "TWILIO_WEBHOOK_URL",
            ]
          : p.channel === "email"
            ? ["RESEND_API_KEY", "EMAIL_FROM"]
            : ["VAPID_SUBJECT", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"];
      if (required.some((name) => !(Deno.env.get(name) || config[name])))
        throw new DeliveryError(`${p.channel}_not_configured`);
      const detail = p.private_content
        ? "You have an upcoming payment. Open Duewell to review your schedule."
        : `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(p.amount_cents / 100)} for ${p.name} is due ${p.due_date}.`;
      const body = `Duewell: ${detail}`;
      if (p.channel === "email") {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${get("RESEND_API_KEY")}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `reminder/${job.id}`,
          },
          body: JSON.stringify({
            from: get("EMAIL_FROM"),
            to: [p.email],
            subject: "Your Duewell payment reminder",
            text: `${body}\n\nView your schedule: ${get("APP_URL")}/#debt/${p.debt_id}\nManage reminders: ${get("APP_URL")}/#settings`,
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok)
          throw new DeliveryError(
            `email_http_${response.status}`,
            response.status === 429,
          );
        provider = (await response.json()).id;
      } else if (p.channel === "sms") {
        const callback = new URL(get("TWILIO_WEBHOOK_URL"));
        callback.searchParams.set("reminder", job.id);
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${get("TWILIO_ACCOUNT_SID")}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${get("TWILIO_ACCOUNT_SID")}:${get("TWILIO_AUTH_TOKEN")}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To: `+${p.phone.replace(/^\+/, "")}`,
              MessagingServiceSid: get("TWILIO_MESSAGING_SERVICE_SID"),
              Body: `${body} Reply STOP to opt out.`,
              StatusCallback: callback.href,
            }),
            signal: AbortSignal.timeout(20000),
          },
        );
        if (!response.ok)
          throw new DeliveryError(
            `sms_http_${response.status}`,
            response.status === 429,
          );
        provider = (await response.json()).sid;
      } else {
        webpush.setVapidDetails(
          get("VAPID_SUBJECT"),
          get("VAPID_PUBLIC_KEY"),
          get("VAPID_PRIVATE_KEY"),
        );
        if (!p.subscriptions.length)
          throw new DeliveryError("no_subscribed_devices");
        let accepted = 0;
        for (const sub of p.subscriptions) {
          if (!allowedPush.test(sub.endpoint)) continue;
          try {
            await webpush.sendNotification(
              sub,
              JSON.stringify({
                title: "Duewell reminder",
                body: detail,
                tag: job.id,
                url: `/#debt/${p.debt_id}`,
              }),
              { TTL: 3600, timeout: 15000 },
            );
            accepted++;
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410)
              await db.from("push_subscriptions").delete().eq("id", sub.id);
          }
        }
        if (!accepted) throw new DeliveryError("push_not_accepted");
        provider = `${accepted} device(s)`;
      }
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
