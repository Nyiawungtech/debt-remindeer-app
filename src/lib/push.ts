import { rpc, vapidPublicKey } from "./client";
export function pushSupported() {
  return (
    isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
export async function enablePush() {
  if (!pushSupported())
    throw new Error(
      "Push is unavailable in this browser. On iPhone, add Duewell to your Home Screen and open it there.",
    );
  if (!vapidPublicKey)
    throw new Error("Push notifications are awaiting server setup.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Notifications are blocked. Allow them in your browser settings, then try again.",
    );
  await navigator.serviceWorker.register("/sw.js");
  const registration = await navigator.serviceWorker.ready;
  const bytes = Uint8Array.from(
    atob(
      vapidPublicKey
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(vapidPublicKey.length / 4) * 4, "="),
    ),
    (c) => c.charCodeAt(0),
  );
  const current = await registration.pushManager.getSubscription();
  const subscription =
    current ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    }));
  const json = subscription.toJSON();
  try {
    await rpc("register_push", {
      p_endpoint: json.endpoint,
      p_p256dh: json.keys?.p256dh,
      p_auth: json.keys?.auth,
    });
  } catch (error) {
    if (!current) await subscription.unsubscribe();
    throw error;
  }
}
export async function disablePush() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const sub = await registration?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    const removed = await sub.unsubscribe();
    if (!removed) throw new Error("Could not unsubscribe this device.");
    try {
      await rpc("remove_push", { p_endpoint: endpoint });
    } catch {
      /* The browser endpoint is invalidated; stale server records are pruned on 410. */
    }
  }
}
export async function detachPush() {
  try {
    await disablePush();
  } catch {
    throw new Error(
      "Could not disconnect this device’s notifications. Try again before signing out.",
    );
  }
}
