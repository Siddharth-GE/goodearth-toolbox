/**
 * What every server action returns: `undefined` for success, `{ error }` to show the person.
 * Import-free on purpose: "use server" files import it and must not drag more into the client bundle.
 */
export type ActionState = { error?: string } | undefined;
