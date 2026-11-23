import { afterEach, expect, it, vi } from "vitest";
import {
  migratedLegacyUrl,
  migrateLegacyRoute,
  navigate,
  routeFromPath,
  routePath,
} from "../src/lib/navigation";

afterEach(() => vi.unstubAllGlobals());

it("uses clean paths for every page and debt detail", () => {
  for (const route of [
    "home",
    "add",
    "debts",
    "calendar",
    "reminders",
    "settings",
    "help",
    "privacy",
    "terms",
    "debt/abc-123",
  ]) {
    const path = routePath(route);
    expect(path).not.toContain("#");
    expect(routeFromPath(path)).toBe(route);
  }
  expect(routePath("home")).toBe("/");
  expect(routeFromPath("/debts/")).toBe("debts");
  expect(routeFromPath("/api/account")).toBeNull();
  expect(() => routePath("https://evil.example")).toThrow();
});

it("migrates old bookmarks without losing PKCE query parameters", () => {
  expect(migratedLegacyUrl("https://settleup.example/#add")).toBe("/add");
  expect(migratedLegacyUrl("https://settleup.example/#debt/abc-123")).toBe(
    "/debt/abc-123",
  );
  expect(
    migratedLegacyUrl("https://settleup.example/?code=pkce-code#home"),
  ).toBe("/?code=pkce-code");
  expect(
    migratedLegacyUrl("https://settleup.example/index.html#settings"),
  ).toBe("/settings");
});

it("leaves auth fragments, content anchors and clean URLs untouched", () => {
  for (const href of [
    "https://settleup.example/#access_token=secret&type=recovery",
    "https://settleup.example/#error=access_denied",
    "https://settleup.example/#main-content",
    "https://settleup.example/add",
    "https://settleup.example/debts#main-content",
  ])
    expect(migratedLegacyUrl(href)).toBeNull();
});

it("replaces legacy URLs and creates history entries only for navigation", () => {
  const location = new URL("https://settleup.example/#add");
  const replaceState = vi.fn((_data, _title, target) => {
    location.href = new URL(target, location).href;
  });
  const pushState = vi.fn((_data, _title, target) => {
    location.href = new URL(target, location).href;
  });
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", {
    location,
    history: { replaceState, pushState },
    dispatchEvent,
  });
  migrateLegacyRoute();
  expect(replaceState).toHaveBeenCalledOnce();
  expect(location.pathname).toBe("/add");
  navigate("debts");
  expect(location.pathname).toBe("/debts");
  expect(pushState).toHaveBeenCalledOnce();
  expect(dispatchEvent.mock.calls[0][0].type).toBe("settleup-navigation");
  navigate("debts");
  expect(pushState).toHaveBeenCalledOnce();
});
