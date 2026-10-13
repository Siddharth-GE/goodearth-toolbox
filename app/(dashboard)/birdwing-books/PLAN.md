# Birdwing Books — the rules

Birdwing Farmstay's expenses, staff attendance and salaries. Grant `/birdwing-books` (its grant warning: it shows every staff member's salary). Migration `0116` (and `0117`), staging only. The second Hospitality tool, beside Birdwing Stays (`app/(dashboard)/birdwing/PLAN.md`). It replaces the combined expenses workbook, the attendance and overtime workbook, and the salary arithmetic nobody wrote down.

## The founder decisions (2026-10-13, the build plan, plan.md)

1. **Expenses follow the Bills shape**: one line, an accounting month apart from the day it was paid, an optional vendor from Masters (or just a name), a bill attached. Statuses: recorded → confirmed (checked against the bill); a confirmed line is marked recorded again before it can change.
2. **One confirmed salary per person per month.** The pay formula is the laptop app's, kept until the founder changes it: base + overtime hours × OT rate + room-days × room rate + guest-days × guest rate + incentives − deductions. Overtime is worked time outside the person's shift; a room-day is an occupied room on a day they worked, a guest-day one guest in the house on such a day. No shift in the rule means a fixed salary.
3. **The pay rule is effective-dated**: a raise is a new rule from its first day; last year's salaries keep last year's rule.

## How it is built

- **`birdwing_confirm_salary()`** (security invoker) writes the run and its one expense line together, in the salary head (`is_salary`, exactly one), once — a second press returns the first run. The total is summed in the database, so the stored run always adds up (a CHECK says so). The figures are worked out on the server from attendance, the rule and occupancy (`lib/birdwing-books/payroll.ts`, tested); the screen sends only who, which month, and the reviewer's incentives, deductions and note.
- **A confirmed month is closed**: the run is never updated, its expense line can't be changed or removed, and that person's attendance for the month is frozen (`birdwing_attendance_open_month`).
- **Books will not pay a month twice**: if the month already holds that person's salary line not written by a run — the old sheet's — the card says so and confirming is refused until that line is removed.
- **Occupancy comes from Stays through one view**, `birdwing_occupancy_facts`: rooms occupied and guests in the house per day, nothing else, readable by either Birdwing grant. Books never reads a stay.
- **The upload** takes the workbook's ten columns as CSV (`lib/birdwing-books/upload.ts`, tested; `parseCsv` in `lib/csv.ts`). The preview says per line new / already in / problem; adding re-reads the file on the server and inserts only the new lines. The repeat-upload key is `Sheet!Cell` (else the line's own content), so a second upload adds nothing and never overwrites. The CSV download is for reading, not for uploading back.
- **Attendance** opens on today — one row of big buttons per person, and "everyone not marked: present" — with the month grid below for corrections. The old sheets' overtime notation ("6.3") is kept in the note, never read as hours.
- **Bills** live in the private `birdwing-books` bucket, served through `/birdwing-books/files/<id>` after an RLS lookup, photos shrunk in the browser first (`lib/uploads/`).
- Staff, pay rules and expense heads are written by admins only; expenses and attendance by `/birdwing-books`.

## Reads outside itself

The shared surfaces (`vendors`, `profiles`) and `birdwing_occupancy_facts`. Financial Management and Reporter read Books only through `0117`'s owner views.

## Open

Pay rules for Amal, Appu and Bijeeth (only Sajna's came from the laptop app); whether a salary needs an approver beyond the reviewer who confirms it.
