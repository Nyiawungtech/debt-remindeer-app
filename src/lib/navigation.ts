const pages = new Set([
  "home",
  "add",
  "debts",
  "calendar",
  "reminders",
  "settings",
  "help",
  "privacy",
  "terms",
]);

export function routeFromPath(pathname: string): string | null {
  const route = pathname.replace(/^\//, "").replace(/\/$/, "");
  if (!route) return "home";
  return pages.has(route) || /^debt\/[a-zA-Z0-9-]+$/.test(route) ? route : null;
}

export function routePath(route: string): string {
  if (routeFromPath("/" + route) !== route) throw new Error("Unknown app page");
  return route === "home" ? "/" : "/" + route;
}

// Keep existing bookmarks and previously delivered reminders usable. Auth
// fragments and accessibility anchors are deliberately left for their owners.
export function migratedLegacyUrl(href: string): string | null {
  const url = new URL(href);
  if (!["/", "/index.html"].includes(url.pathname) || !url.hash) return null;
  const route = routeFromPath("/" + url.hash.slice(1));
  return route ? routePath(route) + url.search : null;
}

export function currentRoute(): string {
  return routeFromPath(window.location.pathname) || "home";
}

export function migrateLegacyRoute() {
  const target = migratedLegacyUrl(window.location.href);
  if (target !== null) window.history.replaceState(null, "", target);
}

export function navigate(route: string) {
  const path = routePath(route);
  if (window.location.pathname !== path || window.location.hash) {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new Event("settleup-navigation"));
  }
}

export function handleAppLink(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    !(event.target instanceof Element)
  )
    return;
  const link = event.target.closest<HTMLAnchorElement>("a[href]");
  if (
    !link ||
    link.hasAttribute("download") ||
    (link.target && link.target !== "_self")
  )
    return;
  const url = new URL(link.href, window.location.origin);
  if (url.origin !== window.location.origin || url.search || url.hash) return;
  const route = routeFromPath(url.pathname);
  if (!route) return;
  event.preventDefault();
  navigate(route);
}
