// The phone app's push notifications (mobile/PLAN.md), reached through the bridge Capacitor puts
// on our own pages. On the website every call finds no bridge and does nothing.
import { PUSH_CHANNEL, safePushPath } from "@/lib/push/rules";

type Listener = { remove(): Promise<void> };

type CapacitorBridge = {
  isPluginAvailable(name: string): boolean;
  getPlatform(): string;
  nativePromise<T>(plugin: string, method: string, options?: object): Promise<T>;
  addListener(plugin: string, event: string, callback: (data: unknown) => void): Listener;
};

const PLUGIN = "PushNotifications";

function bridge(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  const capacitor = (window as { Capacitor?: CapacitorBridge }).Capacitor;
  return capacitor?.isPluginAvailable?.(PLUGIN) ? capacitor : null;
}

// The address Firebase gave this phone on this launch; sign-out hands it to logout().
let currentToken: string | null = null;

export function pushToken(): string | null {
  return currentToken;
}

/**
 * Asks once for permission, then registers; `onToken` records the address for whoever is signed
 * in, and a tapped notification opens its page. Returns a function that stops listening.
 */
export function startPush(onToken: (token: string, platform: string) => void): () => void {
  const cap = bridge();
  if (!cap) return () => {};

  const listeners = [
    cap.addListener(PLUGIN, "registration", (data) => {
      const token = (data as { value?: unknown } | null)?.value;
      if (typeof token !== "string" || !token) return;
      currentToken = token;
      onToken(token, cap.getPlatform());
    }),
    cap.addListener(PLUGIN, "pushNotificationActionPerformed", (data) => {
      const url = (data as { notification?: { data?: { url?: unknown } } } | null)?.notification
        ?.data?.url;
      window.location.assign(safePushPath(url));
    }),
  ];

  void (async () => {
    try {
      let { receive } = await cap.nativePromise<{ receive: string }>(PLUGIN, "checkPermissions");
      if (receive.startsWith("prompt")) {
        ({ receive } = await cap.nativePromise<{ receive: string }>(PLUGIN, "requestPermissions"));
      }
      if (receive !== "granted") return;
      if (cap.getPlatform() === "android") {
        await cap.nativePromise(PLUGIN, "createChannel", {
          id: PUSH_CHANNEL,
          name: "Toolbox",
          description: "Work handed to you",
          importance: 4,
          visibility: 0,
        });
      }
      await cap.nativePromise(PLUGIN, "register");
    } catch {
      // No permission, no Google Play services: the app works without notifications.
    }
  })();

  return () => {
    for (const listener of listeners) void listener.remove();
  };
}
