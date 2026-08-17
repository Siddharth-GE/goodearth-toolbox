/**
 * Which database is this deployment talking to?
 *
 * There are two, and they look identical through the app: the same
 * screens, the same 49 people, the same Saarang plots. The only visible
 * difference is that one holds real work and the other holds practice.
 *
 * That is a hazard, not a curiosity. A site engineer who raises a genuine
 * indent on the practice site has done real work that will never reach
 * anybody — the material is not ordered, and nothing anywhere says so.
 * The failure is silent and it is only found when something does not
 * arrive.
 *
 * So: anything that is not production says so, loudly, on every page.
 */

/**
 * The production Supabase project. Public by nature — it is the hostname
 * in NEXT_PUBLIC_SUPABASE_URL, which ships to every browser anyway — so
 * naming it here reveals nothing.
 *
 * Deliberately compared against rather than trusting a "this is staging"
 * flag someone has to remember to set. A flag that is missing means no
 * banner, which is the dangerous direction. This way, ONLY the real
 * production database is treated as real: a new preview, a new
 * environment, a misconfigured variable and a blank value all fail
 * towards showing the warning.
 */
const PRODUCTION_SUPABASE_REF = "pajfrgnkapicdgangjey";

/** True unless this deployment is pointed at the production database. */
export function isPracticeSite(): boolean {
  return !(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes(PRODUCTION_SUPABASE_REF);
}
