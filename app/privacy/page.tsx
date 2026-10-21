import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";

// Public (PUBLIC_PATHS): the Play Store listing links here. Change the date when the words change.
export const metadata: Metadata = {
  title: "Privacy — Kaadal Toolbox",
};

const CONTACT = "admin@kaadal.co.in";

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-foreground text-lg font-semibold">{title}</h2>
      <div className="text-foreground/85 mt-2 space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="bg-background flex-1 px-4 py-10">
      <article className="mx-auto w-full max-w-2xl">
        <Logo className="size-10" />
        <h1 className="text-foreground font-display mt-4 text-3xl font-medium">Privacy</h1>
        <p className="text-muted mt-2 text-sm">Kaadal Toolbox · updated 21 October 2026</p>

        <Part title="What this app is">
          <p>
            Kaadal Toolbox is the internal work app of Kaadal and Goodearth, in Kannur, Kerala. Our
            staff use it for purchasing, stores, sites, design, client relations and the rest of the
            company&apos;s day-to-day work. Accounts are made by our admins for our own people;
            nobody can sign up from the app.
          </p>
        </Part>

        <Part title="What we keep">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Your account:</strong> your name, work email, phone number and photo in the
              staff directory, your role, and which tools you may use.
            </li>
            <li>
              <strong>Signing in:</strong> sign-in attempts and the devices you have verified, so we
              can stop someone guessing a password. If you sign in with Google, Google tells us your
              name and email address.
            </li>
            <li>
              <strong>Your phone, in the app:</strong> if you allow notifications, the address
              Google&apos;s Firebase gives your phone, so we can tell you when work reaches you. It
              is forgotten when you sign out. If you use fingerprint or face sign-in, your
              fingerprint and face never leave the phone; your password is kept locked on the phone
              itself and is never sent anywhere new.
            </li>
            <li>
              <strong>Your work:</strong> what you enter in the tools — indents, orders, stock,
              drawings, photos, notes — and who entered or changed it.
            </li>
            <li>
              <strong>Clients and vendors:</strong> the names, contact details and project details
              our staff record to do the work.
            </li>
            <li>
              <strong>Problems and speed:</strong> error reports when a screen fails, and how long
              pages take to load, so we can fix them.
            </li>
          </ul>
          <p>
            We do not show ads, sell data, or track you across other apps or websites. The app does
            not use your location, contacts or microphone. It uses your camera or photos only when
            you choose to attach a picture.
          </p>
        </Part>

        <Part title="Where it is kept">
          <p>
            Everything is stored with Supabase (database and files) and served by Vercel, both in
            Mumbai, India, and always sent over an encrypted connection. Sign-in emails go out
            through Resend. Google handles &ldquo;Sign in with Google&rdquo;, the Google Chat app,
            and delivering notifications to the phone app. These companies keep the data for us and
            do not use it for themselves.
          </p>
          <p>
            Inside the company, each person sees only the tools they have been given. Our admins can
            see everything.
          </p>
        </Part>

        <Part title="How long, and deleting it">
          <p>
            Your account stays while you work with us. When you leave, it is switched off and you
            can no longer sign in. Work records are company records and are kept. To have your
            account and personal details removed, or to ask what we hold about you, write to{" "}
            <Link href={`mailto:${CONTACT}`} className="text-accent hover:underline">
              {CONTACT}
            </Link>
            .
          </p>
        </Part>

        <Part title="Children">
          <p>This app is for our staff and is not meant for anyone under 18.</p>
        </Part>

        <Part title="Questions">
          <p>
            Write to{" "}
            <Link href={`mailto:${CONTACT}`} className="text-accent hover:underline">
              {CONTACT}
            </Link>
            . If this page changes, the date at the top changes with it.
          </p>
        </Part>
      </article>
    </main>
  );
}
