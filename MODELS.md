# MODELS.md — which model does what

Fable access is limited, so it is spent where judgment matters and nowhere else. The founder picks the model per session (`/model`); a session can also hand a self-contained chunk to a subagent on a cheaper model. Every model reads CLAUDE.md, knows which model it is, and stays in its lane.

| Role         | Model      | What it does                                                                                                                                                                                                               |
| ------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architect    | **Fable**  | Writes `plan.md` before a build; audits; designs anything touching migrations, RLS, views or money; reviews the full diff and gives the go-ahead at merge or push. Short sessions — Fable does not sit through the typing. |
| Orchestrator | **Opus**   | Runs the build session: works through `plan.md` step by step, writes or delegates the code, vets every piece Sonnet produced before it is committed, takes the hard debugging.                                             |
| Coder        | **Sonnet** | Implements exactly what `plan.md` says: writes the code, runs the checks, opens the page. Doesn't improvise — anything ambiguous or off-plan becomes a written question in `plan.md` for the tier above.                   |
| Sweeper      | **Haiku**  | Mechanical work only — renames, formatting, boilerplate — where the diff is trivially checkable.                                                                                                                           |

## The loop for a feature

1. **Fable plans.** One short session: read the flow, write `plan.md` (scope, migration, files, risks, what to verify in the browser) — and **every step in it carries an owner tag**: `[Fable]`, `[Opus]`, `[Sonnet]` or `[Haiku]`, so the plan says who does what before anyone starts. The founder approves the plan.
2. **Opus and Sonnet build.** Sessions on the feature branch, against `plan.md`. A session takes only the steps tagged for it, and **ticks each step off in `plan.md` as it lands** — mid-build, the plan is the live board of what's done and whose step is next. Opus reviews Sonnet's work before each commit. Deviations are not improvised — they are written into `plan.md` as questions for the tier above.
3. **Fable approves.** One short session at the end: review the full diff against `plan.md`, `SECURITY.md` and `BUGCATCHER.md`, check any migration, then give the merge/push overview in plain language.
4. **The founder ships.** Models approve code; only the founder approves shipping — the staging vet gate in CLAUDE.md sits above every model.

A one-file fix doesn't need the ladder: whichever model is in the chair fixes it, and the merge rules still apply.

## Seeing who did what

- **Live:** the model in the chair is whatever the status bar says — `/model` shows and changes it, and it never switches mid-session on its own. A subagent on another model appears in the transcript as a task entry when it is spawned.
- **Mid-build:** open `plan.md` — the owner tags say whose step each one is, the ticks say what has landed, and the questions section says where a lower tier stopped and waited.
- **Afterwards:** every commit ends with the committing model's own co-author line (`Co-Authored-By: Claude Fable 5 …`, `Claude Opus …`, `Claude Sonnet …`), so `git log` is the permanent record of which model wrote which piece. A model never signs with another model's name.

## Hard rules

- A migration touching RLS, grants, views, definer functions or money may be **drafted** by any model but reaches `db:apply` only after a Fable review.
- Merges to `staging` or `master`, and any push that deploys, wait for Fable's approval pass (step 3).
- Don't burn Fable on typing: if a Fable session finds itself writing ordinary component code, that work belongs in `plan.md` for a cheaper session instead.
- Don't spawn subagents by default — a fresh agent re-reads the whole rulebook from cold. One session, one model, unless a task genuinely splits into independent parts (then the orchestrator passes a model override and vets what comes back).
- A lower tier never widens its own scope. Sonnet finding "one more thing to fix" writes it into `plan.md` or `TODO.md`; it does not fix it unasked.
