import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Auth } from "../src/components/Auth";
import {
  clearPendingConfirmation,
  readPendingConfirmation,
  rememberConfirmation,
} from "../src/lib/confirmation";

vi.mock("../src/lib/client", () => ({
  appUrl: "https://settleup.example",
  configured: true,
  supabase: null,
}));
afterEach(() => vi.unstubAllGlobals());
function memory() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

it("keeps only the pending email and send time in session storage", () => {
  const store = memory();
  rememberConfirmation("  person@example.com ", store, 100_000);
  expect(readPendingConfirmation(store, 100_000)).toEqual({
    email: "person@example.com",
    sentAt: 100_000,
  });
  expect(JSON.parse([...store.values.values()][0])).toEqual({
    email: "person@example.com",
    sentAt: 100_000,
  });
  clearPendingConfirmation(store);
  expect(readPendingConfirmation(store, 100_000)).toBeNull();
});

it("expires stale or invalid pending details and tolerates disabled storage", () => {
  const store = memory();
  rememberConfirmation("person@example.com", store, 100_000);
  expect(readPendingConfirmation(store, 100_000 + 3 * 60 * 60_000)).toBeNull();
  rememberConfirmation("not-an-email", store, 100_000);
  expect(readPendingConfirmation(store, 100_000)).toBeNull();
  const blocked = {
    getItem: () => {
      throw Error("blocked");
    },
    setItem: () => {
      throw Error("blocked");
    },
    removeItem: () => {
      throw Error("blocked");
    },
  };
  expect(readPendingConfirmation(blocked)).toBeNull();
  expect(
    rememberConfirmation("person@example.com", blocked, 100_000).email,
  ).toBe("person@example.com");
  expect(() => clearPendingConfirmation(blocked)).not.toThrow();
});

it("renders a separate confirmation screen after refresh without signup or password fields", () => {
  const store = memory();
  rememberConfirmation("person@example.com", store);
  vi.stubGlobal("sessionStorage", store);
  const html = renderToStaticMarkup(
    createElement(Auth, {
      confirmation: true,
      onDemo: () => {},
      onRecovered: () => {},
    }),
  );
  expect(html).toContain("Check your inbox.");
  expect(html).toContain("person@example.com");
  expect(html).toContain("Resend email in 60s");
  expect(html).toContain("Back to sign in");
  expect(html).not.toContain('type="password"');
  expect(html).not.toContain("Create account");
});

it("allows entering the signup address when the confirmation page has no saved details", () => {
  vi.stubGlobal("sessionStorage", memory());
  const html = renderToStaticMarkup(
    createElement(Auth, {
      confirmation: true,
      onDemo: () => {},
      onRecovered: () => {},
    }),
  );
  expect(html).toContain("Your signup email");
  expect(html).toContain('type="email"');
  expect(html).toContain("Resend confirmation email");
  expect(html).not.toContain('type="password"');
});
