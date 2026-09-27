# Design Management — sets by stage, sheets by code

Branch `feature/design-management-sets` off `staging`. Built by Opus on 2026-09-27 from the founder's requests on staging. The rules it lands are in `app/(dashboard)/design-management/PLAN.md`; this file is the live board until it ships.

## What the founder asked

- "Why are [sets] from different stages available everywhere … if I choose Concept … I can put anything?"
- "One transmittal contains only one stage and you upload a drawing set and inside that sheets … so each time a full set gets to site." Several named sets may share a stage (founder's answer).
- "Each sheet gets renamed with the code, project name, villa name, category, transmittal number and sheet name … when uploading a sheet the user has to enter it." Chosen format: `SAA-Saarang-Villa12-WD-TR0003-GFP.pdf`.
- "Delete all drawings on the app, and wherever it is associated." The founder runs the wipe script (their choice; auto mode refuses a model a bulk storage delete).

## Steps

1. `[Opus]` Migration `0099_drawing_sets_by_stage.sql` drafted: stage code, set's stage, sheet code, one line per transmittal, three triggers. **Drafted, not applied.** — done
2. `[Opus]` `scripts/wipe-drawings.ts`: dry run by default, `--project` required, `--commit` deletes rows in one transaction then the bucket's files. — done
3. `[Opus]` `lib/drawings/sheet-name.ts` (+ tests) and `sheet-context.ts`: the name rule and its one read path. — done
4. `[Opus]` The file route, Supervisors' Drawings list and the transmittal page name sheets through it. — done
5. `[Opus]` `startTransmittal` replaces create/add/re-send/remove; upload requires a sheet code; stage codes editable. — done
6. `[Opus]` Screens: New transmittal window (stage, then that stage's sets or a new one), one-set workspace, sheets by code, sets listed by stage. — done
7. `[Founder]` Run the wipe on staging — done 2026-09-27, every count 0 afterwards:
   ```
   npx tsx scripts/wipe-drawings.ts --project ipstebqawrvhkyntctrv
   npx tsx scripts/wipe-drawings.ts --project ipstebqawrvhkyntctrv --commit
   ```
8. `[Fable]` Review `0099` and the previous build's flow (PR #81). **Skipped for staging by the founder on 2026-09-27; still due before production.**
9. `[Opus]` Apply `0099` to staging, `npm run db:types:staging`, commit, then PR into `staging`. — applied 2026-09-27; the triggers were fired in a rolled-back transaction and every refusal held.
10. `[Founder]` Vet on staging.

## Notes for the review

- `0099` needs no wipe to apply: its columns are nullable and every staging transmittal carries at most one set (checked 2026-09-27). It refuses to apply if one carries two.
- `lib/supabase/database.types.ts` has the three new columns added by hand, exactly as the generator writes them; step 9 regenerates it.
- Sets from before `0099` have no stage: they are listed under "No stage" and `transmittal_lines_stage_match` refuses to send them again. The wipe removes them anyway.
- The download name is built at download time (the number is minted on Issue). The route falls back to the uploaded name if the lookup fails, rather than refusing the drawing.
- Supervisors now reads `transmittals` and `design_stages` through `lib/drawings/sheet-context.ts`; its RLS already allowed both (issued only). STATUS.md's contract row for Supervisors says `lib/drawings/`, which covers it.
- Production: `0099` and a wipe wait for production to be restored; nobody holds `/design-management` there.
