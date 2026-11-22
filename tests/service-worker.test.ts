import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
function runtime() {
  const handlers: Record<string, Function> = {},
    shown: any[] = [],
    stored: any[] = [],
    fetched: any[] = [];
  const self = {
    location: { origin: "https://duewell.example" },
    addEventListener: (name: string, handler: Function) =>
      (handlers[name] = handler),
    registration: {
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
        match: async () => null,
        keys: async () => [],
        delete: async () => {},
      },
    },
  );
  return { handlers, shown, stored, fetched };
}
it("only pre-caches public assets and an offline fallback", async () => {
  const r = runtime();
  let task: Promise<unknown>;
  r.handlers.install({
    waitUntil: (value: Promise<unknown>) => (task = value),
  });
  await task!;
  expect(r.stored).toContain("/offline.html");
  expect(r.stored).not.toContain("/");
  expect(r.stored.every((path: string) => !path.includes("supabase"))).toBe(
    true,
  );
});
it("never intercepts API responses, authentication calls or mutation requests", () => {
  const r = runtime();
  for (const request of [
    { url: "https://project.supabase.co/rest/v1/debts", method: "GET" },
    { url: "https://duewell.example/api/account", method: "GET" },
    { url: "https://duewell.example/assets/data", method: "POST" },
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
      url: "https://duewell.example/#debts",
      method: "GET",
      mode: "navigate",
    },
    respondWith: (p: Promise<unknown>) => (task = p),
  });
  await task!;
  expect(r.stored).toHaveLength(0);
});
it("handles malformed pushes safely and prevents external notification links", async () => {
  const r = runtime();
  let task: Promise<unknown>;
  r.handlers.push({
    data: {
      json: () => ({ url: "https://attacker.example", body: "Reminder" }),
    },
    waitUntil: (p: Promise<unknown>) => (task = p),
  });
  await task!;
  expect(r.shown[0][1].data.url).toBe("/#reminders");
  r.handlers.push({
    data: {
      json: () => {
        throw new Error();
      },
    },
    waitUntil: (p: Promise<unknown>) => (task = p),
  });
  await task!;
  expect(r.shown[1][0]).toBe("Duewell reminder");
});
