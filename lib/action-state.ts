/**
 * The one shape every server action returns.
 *
 * `undefined` means success; `{ error }` is a message fit to show the
 * person who clicked. Actions return errors rather than throwing so a
 * form can render the message inline (and useActionState can hold it) —
 * a thrown error would surface as Next's error boundary instead.
 *
 * This file must stay import-free: file-level "use server" modules import
 * it, and anything it pulled in would be dragged toward the client bundle
 * (see CLAUDE.md, "Shared masters", for the full story).
 */
export type ActionState = { error?: string } | undefined;
