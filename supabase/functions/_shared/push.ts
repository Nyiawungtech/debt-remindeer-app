import { DeliveryError } from "./email.ts";

export interface DeviceSubscription {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export interface PushPayload {
  channel: "push";
  private_content: boolean;
  name: string;
  amount_cents: number;
  due_date: string;
  debt_id: string;
  subscriptions: DeviceSubscription[];
}
export function allowedPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      !u.port &&
      !u.username &&
      !u.password &&
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(
        u.hostname,
      )
    );
  } catch {
    return false;
  }
}
export function pushMessage(jobId: string, p: PushPayload) {
  return JSON.stringify({
    title: "SettleUp payment reminder",
    body: p.private_content
      ? "You have a payment coming up. Open SettleUp to review your schedule."
      : `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(p.amount_cents / 100)} for ${p.name} is due ${p.due_date}.`,
    tag: `settleup-${jobId}`,
    url: `/#debt/${encodeURIComponent(p.debt_id)}`,
  });
}

// If even one device accepted the message, retrying the whole job would duplicate
// it. Unknown network outcomes are also never retried automatically.
export async function sendReminderPush(
  jobId: string,
  p: PushPayload,
  send: (subscription: DeviceSubscription, message: string) => Promise<unknown>,
  retire: (id: string) => Promise<void>,
) {
  let accepted = 0,
    limited = 0,
    other = 0;
  const message = pushMessage(jobId, p);
  for (let start = 0; start < p.subscriptions.length; start += 3) {
    await Promise.all(
      p.subscriptions.slice(start, start + 3).map(async (sub) => {
        if (!allowedPushEndpoint(sub.endpoint)) {
          other++;
          return;
        }
        try {
          await send(sub, message);
          accepted++;
        } catch (error) {
          const status = (error as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            try {
              await retire(sub.id);
            } catch {
              /* No blind delivery retry. */
            }
          } else if (status === 429) limited++;
          else other++;
        }
      }),
    );
  }
  if (accepted) return `web-push:${accepted}`;
  if (other) throw new DeliveryError("push_delivery_uncertain");
  if (limited) throw new DeliveryError("push_http_429", true);
  throw new DeliveryError("push_no_active_devices");
}
