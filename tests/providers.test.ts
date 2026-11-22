import { it, expect } from "vitest";
import { vi } from "vitest";
import {
  DeliveryError,
  sendReminderEmail,
  type EmailPayload,
} from "../supabase/functions/_shared/email";
import { supabaseKey } from "../supabase/functions/_shared/keys";
it("reads modern named Supabase keys before legacy compatibility keys", () => {
  const values: Record<string, string> = {
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_test" }),
    SUPABASE_SERVICE_ROLE_KEY: "legacy",
  };
  expect(supabaseKey("secret", (name) => values[name])).toBe("sb_secret_test");
  expect(() => supabaseKey("secret", () => undefined)).toThrow("Missing");
});
const payload: EmailPayload = {
  channel: "email",
  email: "owner@example.com",
  private_content: true,
  name: "Amazon iPad",
  amount_cents: 5025,
  due_date: "2027-12-06",
  debt_id: "debt-id",
};
const config = {
  apiKey: "test-key",
  from: "Duewell <reminders@example.com>",
  appUrl: "https://duewell.example/",
};
it("sends a private email to the account with a stable idempotency key and settings link", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify({ id: "email-id" }), { status: 200 }),
    );
  expect(await sendReminderEmail("job-id", payload, config, send)).toBe(
    "email-id",
  );
  const [url, init] = send.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  expect(init?.headers).toMatchObject({
    "Idempotency-Key": "reminder/job-id",
    Authorization: "Bearer test-key",
  });
  const body = JSON.parse(init?.body as string);
  expect(body.to).toEqual(["owner@example.com"]);
  expect(body.text).toContain("https://duewell.example/#settings");
  expect(body.text).not.toContain("Amazon");
  expect(body.text).not.toContain("50.25");
});
it("includes debt details only when privacy is turned off", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify({ id: "email-id" }), { status: 200 }),
    );
  await sendReminderEmail(
    "job-id",
    { ...payload, private_content: false },
    config,
    send,
  );
  expect(JSON.parse(send.mock.calls[0][1]?.body as string).text).toContain(
    "$50.25 for Amazon iPad is due 2027-12-06",
  );
});
it("rejects deferred channels without making a provider request", async () => {
  const send = vi.fn<typeof fetch>();
  for (const channel of ["sms", "push"])
    await expect(
      sendReminderEmail("job-id", { ...payload, channel }, config, send),
    ).rejects.toThrow("unsupported_channel");
  expect(send).not.toHaveBeenCalled();
});
it("retries confirmed rate limits but does not automatically retry uncertain delivery", async () => {
  for (const status of [429, 500]) {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("error", { status }));
    await expect(
      sendReminderEmail("job-id", payload, config, send),
    ).rejects.toMatchObject({
      code: `email_http_${status}`,
      retry: status === 429,
    });
  }
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("{}", { status: 200 }));
  await expect(
    sendReminderEmail("job-id", payload, config, send),
  ).rejects.toEqual(new DeliveryError("delivery_uncertain"));
  expect(send).toHaveBeenCalledTimes(1);
});
