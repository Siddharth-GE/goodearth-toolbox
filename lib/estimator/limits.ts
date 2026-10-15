/**
 * The Estimator's text limits — pure, so the import's own checks
 * (model-takeoff.ts, measurement-rules.ts) and the server-only actions
 * read the same numbers. shared.ts re-exports them.
 */
export const NAME_LIMIT = 120;
export const UOM_LIMIT = 20;
export const TEXT_LIMIT = 2000;
