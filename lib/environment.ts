/**
 * The one place that names the databases. Switch day changes these
 * constants; `environment.test.ts` fails until CI and `package.json`
 * agree. Refs are public (they ship in NEXT_PUBLIC_SUPABASE_URL).
 */
export const DATABASES = {
  /** Real work. The only database treated as real. */
  production: "pajfrgnkapicdgangjey",
  /** Practice: staging's site, previews and `npm run dev`. */
  practice: "ipstebqawrvhkyntctrv",
} as const;

/** Where the real toolbox lives, for the practice banner's link. */
export const PRODUCTION_SITE = "toolbox.goodearthkannur.org";

/**
 * True unless this deployment is pointed at the production database.
 * Compared against the production ref, never a "this is staging" flag:
 * a new preview, a typo or a blank value all fail towards the warning.
 */
export function isPracticeSite(): boolean {
  return !(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes(DATABASES.production);
}
