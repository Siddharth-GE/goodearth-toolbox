// The phone app's fingerprint or face sign-in (mobile/PLAN.md), reached through the bridge
// Capacitor puts on our own pages. On the website every call finds no bridge and does nothing.

type CapacitorBridge = {
  isPluginAvailable(name: string): boolean;
  nativePromise<T>(plugin: string, method: string, options?: object): Promise<T>;
};

const PLUGIN = "BiometricSignIn";

function bridge(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  const capacitor = (window as { Capacitor?: CapacitorBridge }).Capacitor;
  return capacitor?.isPluginAvailable?.(PLUGIN) ? capacitor : null;
}

/** `email` is whose sign-in is saved on this phone, if anyone's. Null on the website. */
export type BiometricStatus = { available: boolean; email: string | null };

export type UnlockResult =
  | { ok: true; email: string; password: string }
  // "cleared": the saved sign-in is gone (the phone's fingerprints changed), so say so.
  | { ok: false; reason: "cancelled" | "cleared" | "failed"; message?: string };

function reasonOf(error: unknown): "cancelled" | "cleared" | "failed" {
  const code = (error as { code?: string } | null)?.code;
  return code === "cancelled" || code === "cleared" ? code : "failed";
}

export async function biometricStatus(): Promise<BiometricStatus | null> {
  const cap = bridge();
  if (!cap) return null;
  try {
    const status = await cap.nativePromise<{ available?: boolean; email?: string }>(
      PLUGIN,
      "status",
    );
    return { available: status.available === true, email: status.email ?? null };
  } catch {
    return null;
  }
}

/** Asks for the finger or face, then keeps the sign-in. False if the person said not now. */
export async function saveBiometricSignIn(email: string, password: string): Promise<boolean> {
  const cap = bridge();
  if (!cap) return false;
  try {
    await cap.nativePromise(PLUGIN, "save", { email, password });
    return true;
  } catch {
    return false;
  }
}

export async function unlockBiometricSignIn(): Promise<UnlockResult> {
  const cap = bridge();
  if (!cap) return { ok: false, reason: "failed" };
  try {
    const saved = await cap.nativePromise<{ email: string; password: string }>(PLUGIN, "unlock");
    return { ok: true, email: saved.email, password: saved.password };
  } catch (error) {
    const reason = reasonOf(error);
    const message = (error as { message?: string } | null)?.message;
    return { ok: false, reason, message: reason === "failed" ? message : undefined };
  }
}

export async function forgetBiometricSignIn(): Promise<void> {
  const cap = bridge();
  if (!cap) return;
  try {
    await cap.nativePromise(PLUGIN, "forget");
  } catch {
    // Nothing kept, or the bridge is gone; either way nothing is left to clear.
  }
}
