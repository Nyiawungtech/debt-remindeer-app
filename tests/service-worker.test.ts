import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
function runtime(offline = false) {
  const handlers: Record<string, Function> = {},
    shown: any[] = [],
    stored: any[] = [],
    fetched: any[] = [],
    retired: string[] = [];
  const self = {
    location: { origin: "https://settleup.example" },
    addEventListener: (name: string, handler: Function) =>
      (handlers[name] = handler),
    registration: {
      pushManager: {
        getSubscription: async () => ({
          unsubscribe: async () => {
            retired.push("device");
            return true;
          },
        }),
      },
      showNotification: async (...args: any[]) => {
        shown.push(args);
      },
    },
    clients: {
      claim: async () => {},
      matchAll: async () => [],
      openWindow: async (url: string) => {
        fetched.push(url);
      },
    },
  };
  runInNewContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    {
      self,
      URL,
      Promise,
      fetch: async (request: any) => {
        fetched.push(request);
        if (offline) throw new Error("offline");
        return {
          ok: true,
          clone() {
            return this;
          },
        };
      },
      caches: {
        open: async () => ({
          addAll: async (urls: string[]) => {
            stored.push(...urls);
          },
          put: async (...args: any[]) => {
            stored.push(args);
          },
        }),
        match: async (path: string) =>
          offline && path === "/index.html" ? { shell: true } : null,
        keys: async () => [],
        delete: async () => {},
      },
    },
  );
  return { handlers, shown, stored, fetched, retired };
}
it("only pre-caches public assets and an offline fallback", async () => {
  const r = runtime();
  let task: Promise<unknown>;
  r.handlers.install({
    waitUntil: (value: Promise<unknown>) => (task = value),
  });
  await task!;
  expect(r.stored).toContain("/offline.html");
  expect(r.stored).toContain("/index.html");
  expect(r.stored.every((path: string) => !path.includes("supabase"))).toBe(
    true,
  );
});
it("never intercepts API responses, authentication calls or mutation requests", () => {
  const r = runtime();
  for (const request of [
    { url: "https://project.supabase.co/rest/v1/debts", method: "GET" },
    { url: "https://settleup.example/api/account", method: "GET" },
    { url: "https://settleup.example/assets/data", method: "POST" },
  ]) {
    let intercepted = false;
    r.handlers.fetch({
      request,
      respondWith: () => {
        intercepted = true;
      },
    });
    expect(intercepted).toBe(false);
  }
});
it("does not store account navigation responses", async () => {
  const r = runtime();
  let task: Promise<unknown>;
  r.handlers.fetch({
    request: {
      url: "https://settleup.example/?code=auth-code#debts",
      method: "GET",
      mode: "navigate",
    },
    respondWith: (p: Promise<unknown>) => (task = p),
  });
  await task!;
  expect(r.stored).toHaveLength(0);
});
it("preserves device subscriptions when updating the app shell", async () => {
  const r = runtime();
  let task: Promise<unknown>;
  r.handlers.activate({ waitUntil: (p: Promise<unknown>) => (task = p) });
  await task!;
  expect(r.retired).toEqual([]);
  expect(r.handlers.push).toBeTypeOf("function");
  expect(r.handlers.notificationclick).toBeTypeOf("function");
  expect(r.handlers.fetch).toBeTypeOf("function");
});
it("shows malformed push safely and does not open external or credential-bearing notification links", async () => {
  const r = runtime();
  for (const [value, target] of [
    ["https://evil.test/", "/reminders"],
    ["https://settleup.example/?code=secret#debts", "/reminders"],
    ["/#debt/123", "/debt/123"],
    ["/debt/123", "/debt/123"],
    ["/calendar", "/calendar"],
    ["/api/account", "/reminders"],
    ["/#access_token=secret", "/reminders"],
    ["/debt/123#access_token=secret", "/reminders"],
    ["https://user:password@settleup.example/debts", "/reminders"],
  ]) {
    let task: Promise<unknown>;
    r.handlers.push({
      data: { json: () => ({ url: value }) },
      waitUntil: (p: Promise<unknown>) => (task = p),
    });
    await task!;
    const options = r.shown.at(-1)[1];
    expect(options.data.url).toBe(target);
    r.handlers.notificationclick({
      notification: { close() {}, data: { url: value } },
      waitUntil: (p: Promise<unknown>) => (task = p),
    });
    await task!;
    expect(r.fetched.at(-1)).toBe("https://settleup.example" + target);
  }
  let task: Promise<unknown>;
  r.handlers.push({
    data: {
      json: () => {
        throw new Error("bad JSON");
      },
    },
    waitUntil: (p: Promise<unknown>) => (task = p),
  });
  await task!;
  expect(r.shown.at(-1)[0]).toBe("SettleUp reminder");
});

it("opens the public cached shell for a clean deep route while offline", async () => {
  const r = runtime(true);
  let task: Promise<unknown>;
  r.handlers.fetch({
    request: {
      url: "https://settleup.example/debt/123",
      method: "GET",
      mode: "navigate",
    },
    respondWith: (value: Promise<unknown>) => (task = value),
  });
  expect(await task!).toEqual({ shell: true });
  expect(r.stored).toHaveLength(0);
});
