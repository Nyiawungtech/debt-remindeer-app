export interface EmailPayload {
  channel: string;
  email: string;
  private_content: boolean;
  name: string;
  amount_cents: number;
  due_date: string;
  debt_id: string;
}
export class DeliveryError extends Error {
  constructor(
    public code: string,
    public retry = false,
  ) {
    super(code);
  }
}
export async function sendReminderEmail(
  jobId: string,
  p: EmailPayload,
  config: { apiKey: string; from: string; appUrl: string },
  send: typeof fetch = fetch,
): Promise<string> {
  if (p.channel !== "email") throw new DeliveryError("unsupported_channel");
  const detail = p.private_content
    ? "You have an upcoming payment. Open SettleUp to review your schedule."
    : `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(p.amount_cents / 100)} for ${p.name} is due ${p.due_date}.`;
  const origin = config.appUrl.replace(/\/$/, "");
  const response = await send("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `reminder/${jobId}`,
    },
    body: JSON.stringify({
      from: config.from,
      to: [p.email],
      subject: "Your SettleUp payment reminder",
      text: `SettleUp: ${detail}\n\nView your schedule: ${origin}/debt/${encodeURIComponent(p.debt_id)}\nManage reminders: ${origin}/settings`,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new DeliveryError(
      `email_http_${response.status}`,
      response.status === 429,
    );
  const result = await response.json();
  if (typeof result.id !== "string" || !result.id)
    throw new DeliveryError("delivery_uncertain");
  return result.id;
}
