/**
 * usePushNotifications — registers the service worker and VAPID push
 * subscription, then keeps it alive across token rotations.
 *
 * Call this once at the workspace root (inside CRMShell) after the user
 * is authenticated. It is silent when VAPID is not configured on the server.
 *
 * Flow:
 *  1. Fetch the VAPID public key from the server.
 *  2. Register /sw.js as a service worker.
 *  3. Subscribe to push using the public key.
 *  4. POST the subscription to /api/v1/push/subscribe.
 *  5. On logout / component unmount — do nothing (subscriptions persist
 *     across sessions; the server cleans up stale ones automatically).
 */

import { useEffect } from "react";
import { apiRequest } from "@/lib/api/client";

type VapidKeyDto = { configured: boolean; publicKey: string | null };

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function registerPush(publicKey: string): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  // Register SW
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
  });

  // Wait until the SW is active
  await navigator.serviceWorker.ready;

  // Check existing subscription first — avoid re-subscribing on every mount
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  // Send to server (upsert — safe to call multiple times)
  const sub = subscription.toJSON();
  if (!sub.endpoint || !sub.keys) return;

  await apiRequest("/push/subscribe", {
    method: "POST",
    body: {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys["p256dh"],
        auth: sub.keys["auth"],
      },
    },
  });
}

export function usePushNotifications(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    // Only attempt if the browser supports it
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    // Don't nag users who already denied
    if (Notification.permission === "denied") return;

    let cancelled = false;

    apiRequest<VapidKeyDto>("/push/vapid-key")
      .then((data) => {
        if (cancelled || !data.configured || !data.publicKey) return;
        return registerPush(data.publicKey);
      })
      .catch(() => {
        // Push is optional — never crash the app if VAPID isn't configured
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
