import { rpc, vapidPublicKey } from "./client";

export function pushSupported() {
  return (
    isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
export async function devicePushConnected() {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const registration = await navigator.serviceWorker.getRegistration();
  const sub = await registration?.pushManager.getSubscription();
  return (
    !!sub &&
    (await rpc<boolean>("has_push_subscription", { p_endpoint: sub.endpoint }))
  );
}
export async function enablePush() {
  if (!pushSupported())
    throw new Error(
      "Notifications are unavailable here. On iPhone or iPad, add SettleUp to your Home Screen and open it there first.",
    );
  if (!vapidPublicKey)
    throw new Error("Notifications are awaiting server configuration.");
  if ((await Notification.requestPermission()) !== "granted")
    throw new Error(
      "Notifications were not allowed. You can enable them in your browser settings.",
    );
  await navigator.serviceWorker.register("/sw.js");
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (
    subscription &&
    !(await rpc<boolean>("has_push_subscription", {
      p_endpoint: subscription.endpoint,
    }))
  ) {
    if (!(await subscription.unsubscribe()))
      throw new Error(
        "Disconnect this browser’s previous notification subscription and try again.",
      );
    subscription = null;
  }
  const existing = subscription;
  if (!subscription) {
    const key = vapidPublicKey
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(vapidPublicKey.length / 4) * 4, "=");
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: Uint8Array.from(atob(key), (c) => c.charCodeAt(0)),
    });
  }
  const value = subscription.toJSON();
  try {
    await rpc("register_push", {
      p_endpoint: value.endpoint,
      p_p256dh: value.keys?.p256dh,
      p_auth: value.keys?.auth,
    });
  } catch (error) {
    if (!existing) await subscription.unsubscribe();
    throw error;
  }
}
export async function disablePush() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  // Removing the server destination first also protects shared devices.
  await rpc("remove_push", { p_endpoint: subscription.endpoint });
  if (!(await subscription.unsubscribe()))
    throw new Error(
      "The server subscription was removed. Finish disconnecting notifications in your browser settings.",
    );
}
export async function detachPush() {
  try {
    await disablePush();
  } catch {
    throw new Error(
      "Connect to the internet to disconnect this device’s notifications before signing out.",
    );
  }
}
