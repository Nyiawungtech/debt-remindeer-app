import { admin, env, secureEqual, deliveryConfig } from "../_shared/common.ts";
Deno.serve(async (req) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  if (!req.headers.get("X-Twilio-Signature"))
    return new Response("Forbidden", { status: 403 });
  const db = admin();
  let config: Record<string, string>;
  try {
    config = await deliveryConfig(db);
  } catch {
    return new Response("Delivery settings unavailable", { status: 503 });
  }
  const get = (name: string) => env(name, config);
  const body = await req.text();
  if (body.length > 16384) return new Response("Too large", { status: 413 });
  const params = new URLSearchParams(body);
  const canonical = new URL(get("TWILIO_WEBHOOK_URL"));
  const incoming = new URL(req.url);
  const reminder = incoming.searchParams.get("reminder");
  if (reminder) canonical.searchParams.set("reminder", reminder);
  let signed = canonical.href;
  for (const key of [...new Set(params.keys())].sort())
    signed += key + params.get(key);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(get("TWILIO_AUTH_TOKEN")),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed)),
      ),
    ),
  );
  if (
    !(await secureEqual(signature, req.headers.get("X-Twilio-Signature") || ""))
  )
    return new Response("Forbidden", { status: 403 });
  if (
    (params.get("OptOutType") || "").toUpperCase() === "STOP" ||
    /^\s*(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)\s*$/i.test(
      params.get("Body") || "",
    )
  ) {
    const phone = (params.get("From") || "").replace(/^\+/, "");
    const { data: profiles, error } = await db
      .from("profiles")
      .update({
        sms_enabled: false,
        consent_phone: null,
        sms_consent_at: null,
        sms_consent_version: null,
      })
      .in("consent_phone", [phone, "+" + phone])
      .select("id");
    if (error) return new Response("Retry", { status: 500 });
    if (profiles?.length) {
      const { error: cancelError } = await db
        .from("reminders")
        .update({
          state: "cancelled",
          active: false,
          error_code: "sms_opt_out",
        })
        .in(
          "owner_id",
          profiles.map((p) => p.id),
        )
        .eq("channel", "sms")
        .eq("state", "pending");
      if (cancelError) return new Response("Retry", { status: 500 });
    }
  }
  const status = params.get("MessageStatus");
  const sid = params.get("MessageSid");
  if (
    reminder &&
    sid &&
    ["delivered", "undelivered", "failed"].includes(status || "")
  ) {
    const { error } = await db
      .from("reminders")
      .update({
        state: status === "delivered" ? "delivered" : "failed",
        provider_id: sid,
        error_code:
          status === "delivered"
            ? null
            : `sms_${params.get("ErrorCode") || status}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reminder)
      .eq("channel", "sms")
      .in(
        "state",
        status === "delivered"
          ? ["processing", "accepted", "failed"]
          : ["processing", "accepted"],
      );
    if (error) return new Response("Retry", { status: 500 });
  }
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" },
  });
});
