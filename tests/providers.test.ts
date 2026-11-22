import { it, expect } from "vitest";
import * as webpush from "web-push";
import { createECDH, randomBytes } from "node:crypto";
import { supabaseKey } from "../supabase/functions/_shared/keys";
it("reads modern named Supabase keys before legacy compatibility keys", () => {
  const values: Record<string, string> = {
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_test" }),
    SUPABASE_SERVICE_ROLE_KEY: "legacy",
  };
  expect(supabaseKey("secret", (name) => values[name])).toBe("sb_secret_test");
  expect(() => supabaseKey("secret", () => undefined)).toThrow("Missing");
});
it("constructs an authenticated encrypted Web Push request without sending it", () => {
  const identity = webpush.generateVAPIDKeys();
  const receiver = createECDH("prime256v1");
  receiver.generateKeys();
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/local-test-only",
    keys: {
      p256dh: receiver.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
  const request = webpush.generateRequestDetails(
    subscription,
    JSON.stringify({ title: "Duewell reminder", body: "Test only" }),
    {
      vapidDetails: {
        subject: "https://example.com/contact",
        publicKey: identity.publicKey,
        privateKey: identity.privateKey,
      },
      TTL: 3600,
    },
  );
  expect(request.method).toBe("POST");
  expect(
    String(request.headers.Authorization || request.headers.authorization),
  ).toContain("vapid");
  expect(request.headers["Content-Encoding"]).toBe("aes128gcm");
  expect(request.body?.length).toBeGreaterThan(40);
});
