export const CONFIRMATION_COOLDOWN_MS = 60_000;
const KEY = "settleup.pending-confirmation";
const MAX_AGE_MS = 2 * 60 * 60_000;
export type PendingConfirmation = { email: string; sentAt: number };
type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readPendingConfirmation(
  store?: SessionStore,
  now = Date.now(),
): PendingConfirmation | null {
  try {
    const target = store ?? sessionStorage;
    const value = JSON.parse(target.getItem(KEY) || "null");
    if (!value) return null;
    if (
      typeof value.email !== "string" ||
      value.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+$/.test(value.email) ||
      !Number.isFinite(value.sentAt) ||
      value.sentAt > now + 60_000 ||
      now - value.sentAt > MAX_AGE_MS
    ) {
      target.removeItem(KEY);
      return null;
    }
    return { email: value.email, sentAt: value.sentAt };
  } catch {
    return null;
  }
}

export function rememberConfirmation(
  email: string,
  store?: SessionStore,
  now = Date.now(),
): PendingConfirmation {
  const pending = { email: email.trim(), sentAt: now };
  try {
    (store ?? sessionStorage).setItem(KEY, JSON.stringify(pending));
  } catch {
    // The in-memory confirmation screen still works if storage is disabled.
  }
  return pending;
}

export function clearPendingConfirmation(store?: SessionStore) {
  try {
    (store ?? sessionStorage).removeItem(KEY);
  } catch {}
}
