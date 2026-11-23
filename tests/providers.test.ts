import { it, expect } from "vitest";
import { vi } from "vitest";
import {
  DeliveryError,
  sendReminderEmail,
  type EmailPayload,
} from "../supabase/functions/_shared/email";
import { supabaseKey } from "../supabase/functions/_shared/keys";
import { createECDH, randomBytes } from "node:crypto";
import * as webpush from "web-push";
import {
  allowedPushEndpoint,
  pushMessage,
  sendReminderPush,
  type PushPayload,
} from "../supabase/functions/_shared/push";
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
  from: "SettleUp <reminders@example.com>",
  appUrl: "https://settleup.example/",
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
  expect(body.text).toContain("https://settleup.example/settings");
  expect(body.text).toContain("https://settleup.example/debt/debt-id");
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
it("does not send non-email channels to the email provider", async () => {
  const send = vi.fn<typeof fetch>();
  for (const channel of ["sms", "push"])
    await expect(
      sendReminderEmail("job-id", { ...payload, channel }, config, send),
    ).rejects.toThrow("unsupported_channel");
  expect(send).not.toHaveBeenCalled();
});
const push: PushPayload = {
  ...payload,
  channel: "push",
  subscriptions: [
    {
      id: "one",
      endpoint: "https://fcm.googleapis.com/fcm/send/test-one",
      keys: { p256dh: "test", auth: "test" },
    },
    {
      id: "two",
      endpoint: "https://web.push.apple.com/test-two",
      keys: { p256dh: "test", auth: "test" },
    },
  ],
};
it("constructs an encrypted, VAPID-authenticated Web Push request without contacting a provider", () => {
  const client = createECDH("prime256v1");
  client.generateKeys();
  const vapid = webpush.generateVAPIDKeys();
  const request = webpush.generateRequestDetails(
    {
      endpoint: "https://fcm.googleapis.com/fcm/send/test-device",
      keys: {
        p256dh: client.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
    },
    pushMessage("job", push),
    {
      vapidDetails: {
        subject: "https://settleupapp.cloud",
        publicKey: vapid.publicKey,
        privateKey: vapid.privateKey,
      },
      TTL: 3600,
    },
  );
  expect(request.headers.Authorization).toMatch(/^vapid /);
  expect(request.headers["Content-Encoding"]).toBe("aes128gcm");
  expect(request.body?.toString()).not.toContain("SettleUp");
  expect(request.body?.length).toBeGreaterThan(100);
});
it("keeps push content private by default and restricts delivery to browser push services", () => {
  const message = JSON.parse(pushMessage("job", push));
  expect(message.body).not.toContain("Amazon");
  expect(message.body).not.toContain("50.25");
  expect(message.url).toBe("/debt/debt-id");
  expect(
    JSON.parse(pushMessage("job", { ...push, private_content: false })).body,
  ).toContain("$50.25");
  for (const endpoint of [
    "http://fcm.googleapis.com/x",
    "https://fcm.googleapis.com@evil.test/x",
    "https://127.0.0.1/x",
    "https://fcm.googleapis.com.evil.test/x",
    "https://fcm.googleapis.com:8443/x",
  ])
    expect(allowedPushEndpoint(endpoint)).toBe(false);
  expect(allowedPushEndpoint(push.subscriptions[0].endpoint)).toBe(true);
});
it("retires expired devices and avoids duplicate sends after partial acceptance", async () => {
  const send = vi
    .fn()
    .mockRejectedValueOnce({ statusCode: 410 })
    .mockResolvedValueOnce({ statusCode: 201 });
  const retire = vi.fn().mockResolvedValue(undefined);
  expect(await sendReminderPush("job", push, send, retire)).toBe("web-push:1");
  expect(retire).toHaveBeenCalledWith("one");
  expect(send).toHaveBeenCalledTimes(2);
  const partial = vi
    .fn()
    .mockResolvedValueOnce({ statusCode: 201 })
    .mockRejectedValueOnce({ statusCode: 429 });
  expect(await sendReminderPush("job", push, partial, retire)).toBe(
    "web-push:1",
  );
});
it("retries push rate limits only when no send has an uncertain result", async () => {
  const retire = vi.fn().mockResolvedValue(undefined);
  await expect(
    sendReminderPush(
      "job",
      push,
      vi.fn().mockRejectedValue({ statusCode: 429 }),
      retire,
    ),
  ).rejects.toMatchObject({ retry: true });
  const send = vi
    .fn()
    .mockRejectedValueOnce({ statusCode: 429 })
    .mockRejectedValueOnce(new Error("timeout"));
  await expect(
    sendReminderPush("job", push, send, retire),
  ).rejects.toMatchObject({ code: "push_delivery_uncertain", retry: false });
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
