"use client";

import { FormMessage } from "@/components/ui/form-message";
import { login, signInWithGoogle } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  biometricStatus,
  forgetBiometricSignIn,
  saveBiometricSignIn,
  unlockBiometricSignIn,
  type BiometricStatus,
} from "@/lib/native/biometric-sign-in";
import { Fingerprint } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

// Messages for redirects back here (Google callback, reset flow); the URL carries only a keyword.
const PARAM_ERRORS: Record<string, string> = {
  google: "That Google account isn't part of the team. Use your work login, or ask an admin.",
  deactivated: "This account has been deactivated. Ask an admin to switch it back on.",
  auth: "Sign-in didn't complete. Try again.",
};

const SAVE_AGAIN = "Sign in with your password, and tick the box to save it again.";

// The phone app asks for the finger by itself once per launch, not again after each sign-out.
let askedThisLaunch = false;

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  // Read client-side so the page itself stays prerendered static — an
  // awaited searchParams prop would make /login dynamic (BUGCATCHER #6).
  const params = useSearchParams();
  const resetDone = params.get("reset") === "done";
  const paramError = PARAM_ERRORS[params.get("error") ?? ""];

  // Fingerprint or face sign-in, in the phone app only; null on the website.
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null);
  const [remember, setRemember] = useState(false);
  const [notice, setNotice] = useState<string>();
  // A sign-in that used, or just saved, the phone's copy: if it fails, that copy is wrong.
  const attempt = useRef<"fingerprint" | "saved" | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  async function signInWithFingerprint() {
    setNotice(undefined);
    const result = await unlockBiometricSignIn();
    if (!result.ok) {
      if (result.reason === "cleared") {
        setBiometric((current) => current && { ...current, email: null });
        setNotice(
          `The phone's fingerprints or face changed, so the saved sign-in was cleared. ${SAVE_AGAIN}`,
        );
      } else if (result.reason === "failed" && result.message) {
        setNotice(result.message);
      }
      return;
    }
    const formData = new FormData();
    formData.set("email", result.email);
    formData.set("password", result.password);
    attempt.current = "fingerprint";
    startTransition(() => action(formData));
  }

  useEffect(() => {
    let left = false;
    void biometricStatus().then((status) => {
      if (left || !status) return;
      setBiometric(status);
      if (status.email && emailInput.current && !emailInput.current.value) {
        emailInput.current.value = status.email;
      }
      if (status.available && status.email && !askedThisLaunch && !paramError && !resetDone) {
        askedThisLaunch = true;
        void signInWithFingerprint();
      }
    });
    return () => {
      left = true;
    };
    // Once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tried = attempt.current;
    attempt.current = null;
    if (!state?.error || !tried) return;
    void forgetBiometricSignIn();
    setBiometric((current) => current && { ...current, email: null });
    if (tried === "fingerprint") {
      setNotice(
        `The saved sign-in no longer works, so it was cleared from this phone. ${SAVE_AGAIN}`,
      );
    }
  }, [state]);

  // Saving asks for the finger first; the sign-in then goes ahead either way.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    setNotice(undefined);
    if (!remember || !biometric?.available) return;
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    void saveBiometricSignIn(email, password).then(async (saved) => {
      if (saved) attempt.current = "saved";
      // "Not now" leaves nothing saved, not even an earlier sign-in.
      setBiometric(await biometricStatus());
      startTransition(() => action(formData));
    });
  }

  return (
    <div className="space-y-4">
      <form action={action} onSubmit={onSubmit} className="space-y-4">
        {!state && resetDone && (
          <FormMessage success="Password changed — sign in with the new one." />
        )}
        {!state && paramError && <FormMessage error={paramError} />}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            ref={emailInput}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {biometric?.available && (
          <label className="text-foreground flex items-center gap-2 text-sm">
            <Checkbox checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            Use fingerprint or face next time
          </label>
        )}
        <FormMessage error={state?.error} />
        {notice && <p className="text-muted text-sm">{notice}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="flex items-center gap-3">
        <div className="bg-border h-px flex-1" />
        <span className="text-muted text-xs">or</span>
        <div className="bg-border h-px flex-1" />
      </div>
      {biometric?.available && biometric.email && (
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => void signInWithFingerprint()}
          >
            <Fingerprint className="size-4" />
            Sign in with fingerprint or face
          </Button>
          <p className="text-muted truncate text-center text-xs">{biometric.email}</p>
        </div>
      )}
      <form action={signInWithGoogle}>
        <Button type="submit" variant="secondary" className="w-full">
          <GoogleMark />
          Continue with Google
        </Button>
      </form>
    </div>
  );
}

/** Google's "G": brand colours, not palette tokens, since it is a logo. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.26-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}
