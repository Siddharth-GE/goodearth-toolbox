import {
  BOUNCE_REASONS,
  CUSTOM_SET,
  DEFAULT_CUSTOM_STEPS,
  MAX_CUSTOM_STEPS,
  buttonsFor,
  customStepCount,
} from "./trail-rules";
import type {
  ActivityOption,
  ButtonAction,
  LegOption,
  PersonOption,
  StepDefault,
  TrailSetOption,
  TrailSummary,
} from "./trail-rules";

// The bot's fixed sentences and card builders: words only, no I/O. Refusals are pinned so the
// door never says more about who exists than these five lines. Text sentences use *bold*
// asterisks and skip escapeHtml; anything somebody typed goes through it inside cards.

export type RefusalKind = "no-email" | "unknown" | "inactive" | "no-relay" | "failed";

const REFUSALS: Record<RefusalKind, string> = {
  "no-email":
    "Google didn't tell me who you are, so I can't act for you. Ask an admin to check the Relay bot.",
  unknown:
    "I don't know you yet: there's no toolbox account for this email. Ask an admin in Settings.",
  inactive:
    "Your toolbox account is switched off, so I can't act for you. Ask an admin in Settings.",
  "no-relay": "You don't have the Relay tool yet. Ask an admin to grant it in Settings.",
  failed: "I couldn't check who you are just now. Please try again in a moment.",
};

export function identityRefusal(kind: RefusalKind): string {
  return REFUSALS[kind];
}

export function greeting(firstName: string, command: string | null): string {
  if (command) {
    return `Hi ${firstName}! I heard ${command} — it isn't wired up yet, but now I know who's asking.`;
  }
  return `Hi ${firstName}! Try /court to see what's in your hand, or /trail followed by a villa name.`;
}

export function joinHello(label: string | null): string {
  if (label) {
    return `Hello! I'm the Relay bot. I've linked this space to ${label}. Commands here default to it; /link changes that.`;
  }
  return "Hello! I'm the Relay bot. Use /link to tell me which villa or project this space is for — until then, commands here span everything.";
}

export function dmCannotLink(): string {
  return "A DM can't be linked — commands here already span everything.";
}

export function dialogNotEnabled(): string {
  return "The /link command needs 'Opens a dialog' ticked in the Chat app's configuration — an admin can do that in the Google Cloud console.";
}

export function linkSaveFailed(): string {
  return "I couldn't save that just now. Please try again in a moment.";
}

export function linkConfirmation(label: string | null): string {
  if (label) {
    return `This space is now linked to ${label}.`;
  }
  return "This space is no longer linked — commands here span everything.";
}

export type LinkTarget = { value: string; text: string };

// `submitUrl`: for an HTTP app a button's `action.function` is a URL, not a name (trap (e)).
// The `action` parameter tells the door which Save this is.
export function linkDialog(
  targets: LinkTarget[],
  current: string,
  submitUrl: string,
): Record<string, unknown> {
  return {
    sections: [
      {
        widgets: [
          {
            selectionInput: {
              name: "target",
              label: "Link this space to",
              type: "DROPDOWN",
              items: targets.map((t) => ({
                text: t.text,
                value: t.value,
                selected: t.value === current,
              })),
            },
          },
          {
            buttonList: {
              buttons: [
                {
                  text: "Save",
                  onClick: {
                    action: {
                      function: submitUrl,
                      parameters: [{ key: "action", value: "link" }],
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

// When Google asks for a dialog the answer must be a dialog, even a refusal (trap (f)).
export function noticeDialog(text: string): Record<string, unknown> {
  return { sections: [{ widgets: [{ textParagraph: { text } }] }] };
}

// Escapes the three characters HTML parses as markup, so a stray "<" in a villa name can't break a tag.
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The app's danger red (--danger); the client part rides in the same red font.
function coldStatusLine(row: TrailSummary): string {
  const clientPart = row.isWithClient
    ? `, with the client ${row.withClientDays} day${row.withClientDays === 1 ? "" : "s"}`
    : "";
  return `<font color="#dc2626">Cold — day ${row.daysInLeg} of ${row.expectedDays}${clientPart}</font>`;
}

// The app's warning amber (--warning).
function withClientStatusLine(row: TrailSummary): string {
  const days = `${row.withClientDays} day${row.withClientDays === 1 ? "" : "s"}`;
  return `<font color="#d97706">With the client ${days} — day ${row.daysInLeg} of ${row.expectedDays}</font>`;
}

// Third line of every row, coloured like the app's badges. The <font> tag is unproven in
// Google's render (BUGCATCHER #17); the 🔴/🟠 mark on the top label carries the meaning if dropped.
function statusLine(row: TrailSummary): string {
  if (row.isStuck) return coldStatusLine(row);
  if (row.isWithClient) return withClientStatusLine(row);
  return `Day ${row.daysInLeg} of ${row.expectedDays}, on time`;
}

function legAndLabel(row: TrailSummary): string {
  const legNumber = row.currentLeg ?? row.legCount;
  const base = `Leg ${legNumber} of ${row.legCount}`;
  return row.legLabel ? `${base} · ${escapeHtml(row.legLabel)}` : base;
}

function courtBottomLabel(row: TrailSummary): string {
  return legAndLabel(row);
}

function trailBottomLabel(row: TrailSummary): string {
  const holder = row.holderName ? escapeHtml(row.holderName) : "Unnamed";
  return `${legAndLabel(row)} · with ${holder}`;
}

function subtitleWithCounts(base: string, coldCount?: number, withClientCount?: number): string {
  const parts: string[] = [];
  if (coldCount && coldCount > 0) parts.push(`${coldCount} cold`);
  if (withClientCount && withClientCount > 0) parts.push(`${withClientCount} with the client`);
  return parts.length > 0 ? `${base} · ${parts.join(", ")}` : base;
}

const ACTION_BUTTON_TEXT: Record<ButtonAction, string> = {
  push: "Push",
  finish: "Finish",
  bounce: "Bounce",
  hold: "With client",
  return: "Back from client",
};

// Every button posts to submitUrl (a URL, never a name: trap (e)) carrying action, trail and
// leg. Bounce alone opens a dialog, since it needs a reason first.
function actionButtons(row: TrailSummary, submitUrl: string): Record<string, unknown>[] {
  if (row.currentLeg === null) return [];
  const fromLeg = row.currentLeg;

  return buttonsFor(row).map((action) => {
    const clickAction: Record<string, unknown> = {
      function: submitUrl,
      parameters: [
        { key: "action", value: action },
        { key: "chain", value: row.chainId },
        { key: "leg", value: String(fromLeg) },
      ],
    };
    // `interaction` belongs to the action, not the click around it; one level up Google silently
    // rejects the whole card (trap (i)).
    if (action === "bounce") clickAction.interaction = "OPEN_DIALOG";
    return { text: ACTION_BUTTON_TEXT[action], onClick: { action: clickAction } };
  });
}

// Cold wins over with-the-client when both are true. Open in the toolbox always comes last,
// so a row never ends on a button that moves something.
function rowWidgets(
  row: TrailSummary,
  origin: string,
  bottomLabel: string,
  leadingButtons: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  const mark = row.isStuck ? "🔴 " : row.isWithClient ? "🟠 " : "";
  const place = row.unitName
    ? `${escapeHtml(row.projectName)} · ${escapeHtml(row.unitName)}`
    : escapeHtml(row.projectName);
  const topLabel = `${mark}${place}`;
  const activity = `<b>${escapeHtml(row.activityName)}</b>`;
  // A trail from a type has the type's name as activity and title; print it once.
  const title = row.title?.trim() ?? "";
  const repeats = title.toLowerCase() === row.activityName.trim().toLowerCase();
  const lines = [activity];
  if (title && !repeats) lines.push(escapeHtml(title));
  lines.push(statusLine(row));
  const text = lines.join("<br>");

  const openInToolbox = {
    text: "Open in the toolbox",
    onClick: { openLink: { url: `${origin}/relay/trails/${row.chainId}` } },
  };

  return [
    { decoratedText: { topLabel, text, bottomLabel, wrapText: true } },
    { buttonList: { buttons: [...leadingButtons, openInToolbox] } },
  ];
}

export function askForWords(): string {
  return "Tell me what to look for — a villa, a project or an activity, e.g. /trail villa 12.";
}

// `rows` is already scoped, `more` were cut at the ten-cap. `notice` is the line a rebuilt card
// puts on top after a press. The counts cover the whole in-scope court, so callers pass them
// before takeForCard runs.
export function courtCard(input: {
  firstName: string;
  scopeLabel: string | null;
  rows: TrailSummary[];
  more: number;
  moreElsewhere: number;
  origin: string;
  submitUrl: string;
  notice?: string;
  coldCount?: number;
  withClientCount?: number;
}): Record<string, unknown> {
  const {
    scopeLabel,
    rows,
    more,
    moreElsewhere,
    origin,
    submitUrl,
    notice,
    coldCount,
    withClientCount,
  } = input;
  const subtitle = subtitleWithCounts(scopeLabel ?? "everything", coldCount, withClientCount);

  const widgets: Record<string, unknown>[] = [];
  if (notice && notice.trim()) {
    widgets.push({ decoratedText: { text: `<b>${escapeHtml(notice)}</b>`, wrapText: true } });
  }
  if (rows.length === 0) {
    widgets.push({ textParagraph: { text: "Court cleared — nothing is waiting on you." } });
  } else {
    for (const row of rows) {
      widgets.push(
        ...rowWidgets(row, origin, courtBottomLabel(row), actionButtons(row, submitUrl)),
      );
    }
  }

  if (more > 0) {
    widgets.push({
      textParagraph: {
        text: `and ${more} more — <a href="${origin}/relay/court">open your court in the toolbox</a>`,
      },
    });
  }
  if (moreElsewhere > 0) {
    widgets.push({
      textParagraph: {
        text: `You also hold ${moreElsewhere} trail${moreElsewhere === 1 ? "" : "s"} outside this space.`,
      },
    });
  }

  return {
    cardId: "court",
    card: { header: { title: "Your court", subtitle }, sections: [{ widgets }] },
  };
}

function trailEmptyText(words: string[], origin: string): string {
  if (words.length === 0) return "Nothing is running here right now.";
  const phrase = escapeHtml(words.join(" "));
  return `Nothing running matches '${phrase}'. Finished and waiting trails are <a href="${origin}/relay/trails">in the toolbox</a>.`;
}

// `words` only says what was searched; `rows` are already filtered. Counts as in courtCard.
export function trailCard(input: {
  words: string[];
  scopeLabel: string | null;
  rows: TrailSummary[];
  more: number;
  origin: string;
  coldCount?: number;
  withClientCount?: number;
}): Record<string, unknown> {
  const { words, scopeLabel, rows, more, origin, coldCount, withClientCount } = input;
  const base =
    words.length > 0 ? `matching '${escapeHtml(words.join(" "))}'` : (scopeLabel ?? "everything");
  const subtitle = subtitleWithCounts(base, coldCount, withClientCount);

  const widgets: Record<string, unknown>[] = [];
  if (rows.length === 0) {
    widgets.push({ textParagraph: { text: trailEmptyText(words, origin) } });
  } else {
    for (const row of rows) widgets.push(...rowWidgets(row, origin, trailBottomLabel(row)));
    if (more > 0) {
      widgets.push({
        textParagraph: {
          text: `and ${more} more — <a href="${origin}/relay/trails">open in the toolbox</a>`,
        },
      });
    }
  }

  return {
    cardId: "trails",
    card: { header: { title: "Trails", subtitle }, sections: [{ widgets }] },
  };
}

function legOptionText(leg: LegOption): string {
  const labelPart = leg.label ? ` · ${escapeHtml(leg.label)}` : "";
  const assignee = leg.assigneeName ? escapeHtml(leg.assigneeName) : "Unnamed";
  return `Leg ${leg.legNo}${labelPart} · ${assignee}`;
}

// Built even with no legs behind it: the opening button is only offered when buttonsFor found one.
export function bounceDialog(input: {
  trail: TrailSummary;
  legs: LegOption[];
  submitUrl: string;
}): Record<string, unknown> {
  const { trail, legs, submitUrl } = input;
  const legPart = trail.legLabel ? ` · ${escapeHtml(trail.legLabel)}` : "";
  const paragraph = `Bounce <b>${escapeHtml(trail.activityName)}</b> back — it is on leg ${trail.currentLeg} of ${trail.legCount}${legPart}.`;

  return {
    sections: [
      {
        widgets: [
          { textParagraph: { text: paragraph } },
          {
            selectionInput: {
              name: "to_leg",
              label: "Send it back to",
              type: "DROPDOWN",
              items: legs.map((leg, index) => ({
                text: legOptionText(leg),
                value: String(leg.legNo),
                selected: index === legs.length - 1,
              })),
            },
          },
          {
            selectionInput: {
              name: "reason",
              label: "Reason",
              type: "DROPDOWN",
              items: BOUNCE_REASONS.map((r) => ({ text: r.text, value: r.value, selected: false })),
            },
          },
          {
            textInput: {
              name: "note",
              label: "What needs to change",
              type: "MULTIPLE_LINE",
              hintText: "A bounce is never silent.",
            },
          },
          {
            buttonList: {
              buttons: [
                {
                  text: "Save",
                  onClick: {
                    action: {
                      function: submitUrl,
                      parameters: [
                        { key: "action", value: "bounce" },
                        { key: "chain", value: trail.chainId },
                        { key: "leg", value: String(trail.currentLeg) },
                      ],
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

// `units` is a flat list: a trail starts on one villa, never a whole project. A chat trail
// starts now by default, unlike the app's queue. The step count is asked here because a Chat
// dialog can't grow a row once open; a trail type ignores it.
export function newTrailDialog(input: {
  units: { value: string; text: string }[];
  sets: TrailSetOption[];
  selectedUnit: string | null;
  submitUrl: string;
}): Record<string, unknown> {
  const { units, sets, selectedUnit, submitUrl } = input;

  return {
    sections: [
      {
        widgets: [
          {
            selectionInput: {
              name: "unit",
              label: "Which house",
              type: "DROPDOWN",
              items: units.map((u) => ({
                text: u.text,
                value: u.value,
                selected: u.value === selectedUnit,
              })),
            },
          },
          {
            selectionInput: {
              name: "set",
              label: "Trail type",
              type: "DROPDOWN",
              items: [
                { text: "Custom — I'll pick the steps", value: CUSTOM_SET, selected: false },
                ...sets.map((s) => ({ text: s.name, value: s.id, selected: false })),
              ],
            },
          },
          {
            selectionInput: {
              name: "steps",
              label: "Steps (custom trails only)",
              type: "DROPDOWN",
              items: Array.from({ length: MAX_CUSTOM_STEPS }, (_, index) => {
                const count = index + 1;
                return {
                  text: String(count),
                  value: String(count),
                  selected: count === DEFAULT_CUSTOM_STEPS,
                };
              }),
            },
          },
          {
            decoratedText: {
              text: "Choose the people myself",
              bottomLabel: "Off = each step goes to whoever usually carries it.",
              switchControl: {
                name: "pick_people",
                value: "on",
                selected: false,
                controlType: "SWITCH",
              },
            },
          },
          {
            decoratedText: {
              text: "Start now",
              bottomLabel: "The clock begins today. Off = queued, started later from the toolbox.",
              switchControl: { name: "start", value: "on", selected: true, controlType: "SWITCH" },
            },
          },
          {
            buttonList: {
              buttons: [
                {
                  text: "Save",
                  onClick: {
                    action: {
                      function: submitUrl,
                      parameters: [{ key: "action", value: "newtrail" }],
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

// Page 2. `values` wins over defaults, so a refused form is redrawn as the person left it. The
// Open button carries page 1's answers, so the door keeps no memory between pages.
export function trailStepsDialog(input: {
  mode: "set" | "custom";
  steps: StepDefault[];
  people: PersonOption[];
  activities: ActivityOption[];
  params: { unit: string; set: string; start: boolean };
  submitUrl: string;
  customSteps?: number;
  error?: string | null;
  values?: Record<string, string | null>;
}): Record<string, unknown> {
  const { mode, steps, people, activities, params, submitUrl, error, values } = input;
  const widgets: Record<string, unknown>[] = [];

  const customRows = customStepCount(input.customSteps ?? null);

  // A box the person cleared stays cleared on redraw; an untouched one takes the default.
  const wasSubmitted = (name: string): boolean => values !== undefined && name in values;
  const submitted = (name: string): string => values?.[name] ?? "";

  const personDropdown = (name: string, defaultId: string | null): Record<string, unknown> => {
    const selectedId = wasSubmitted(name) ? submitted(name) : (defaultId ?? "");
    return {
      selectionInput: {
        name,
        label: "Who carries it",
        type: "DROPDOWN",
        items: people.map((p) => ({ text: p.name, value: p.id, selected: p.id === selectedId })),
      },
    };
  };

  if (error) {
    widgets.push({
      textParagraph: { text: `<font color="#b3261e"><b>${escapeHtml(error)}</b></font>` },
    });
  }

  if (mode === "set") {
    steps.forEach((step, index) => {
      const stepNo = index + 1;
      widgets.push({
        decoratedText: {
          topLabel: `Step ${stepNo}`,
          text: `<b>${escapeHtml(step.activityName)}</b>`,
        },
      });
      widgets.push(personDropdown(`person_${stepNo}`, step.assigneeId));
      const daysName = `days_${stepNo}`;
      widgets.push({
        textInput: {
          name: daysName,
          label: "Days",
          value: wasSubmitted(daysName) ? submitted(daysName) : String(step.expectedDays),
        },
      });
    });
  } else {
    widgets.push({
      textInput: {
        name: "title",
        label: "What is this trail for",
        hintText: "Optional",
        ...(wasSubmitted("title") ? { value: submitted("title") } : {}),
      },
    });
    for (let stepNo = 1; stepNo <= customRows; stepNo++) {
      const activityName = `activity_${stepNo}`;
      const activityChosen = wasSubmitted(activityName) ? submitted(activityName) : "";
      widgets.push({
        selectionInput: {
          name: activityName,
          label: `Step ${stepNo} · activity`,
          type: "DROPDOWN",
          items: activities.map((a) => ({
            text: a.name,
            value: a.id,
            selected: a.id === activityChosen,
          })),
        },
      });
      widgets.push(personDropdown(`person_${stepNo}`, null));
      const daysName = `days_${stepNo}`;
      widgets.push({
        textInput: {
          name: daysName,
          label: "Days",
          hintText: "e.g. 5",
          ...(wasSubmitted(daysName) ? { value: submitted(daysName) } : {}),
        },
      });
    }
  }

  widgets.push({
    buttonList: {
      buttons: [
        {
          text: "Open trail",
          onClick: {
            action: {
              function: submitUrl,
              parameters: [
                { key: "action", value: "newtrail-open" },
                { key: "unit", value: params.unit },
                { key: "set", value: params.set },
                { key: "start", value: params.start ? "on" : "" },
                { key: "mode", value: mode },
                {
                  key: "count",
                  value: mode === "set" ? String(steps.length) : String(customRows),
                },
                ...(mode === "set"
                  ? [{ key: "activities", value: steps.map((s) => s.activityId).join(",") }]
                  : []),
              ],
            },
          },
        },
      ],
    },
  });

  return { sections: [{ widgets }] };
}

export function customDepartmentsNote(): string {
  return "Add its departments on the trail page if it needs them.";
}

function trailWhere(trail: TrailSummary): string {
  return `on ${trail.unitName ?? trail.projectName}`;
}

function trailLegPart(trail: TrailSummary): string {
  return trail.legLabel ? ` · ${trail.legLabel}` : "";
}

// Public confirmations are `text`, not cards. Built from the fresh summary, so they show where
// the write left the trail.
export function pushedText(firstName: string, trail: TrailSummary): string {
  const holder = trail.holderName ?? "nobody named";
  return `*${firstName}* pushed *${trail.activityName}* ${trailWhere(trail)} to leg ${trail.currentLeg} of ${trail.legCount}${trailLegPart(trail)} — now with ${holder}.`;
}

export function finishedText(firstName: string, trail: TrailSummary): string {
  return `*${firstName}* finished *${trail.activityName}* ${trailWhere(trail)} 🎉`;
}

export function bouncedText(
  firstName: string,
  trail: TrailSummary,
  reasonText: string,
  note: string,
): string {
  const holder = trail.holderName ?? "nobody named";
  return `*${firstName}* bounced *${trail.activityName}* ${trailWhere(trail)} back to leg ${trail.currentLeg} of ${trail.legCount}${trailLegPart(trail)} — with ${holder}. ${reasonText}: ${note}`;
}

export function heldText(firstName: string, trail: TrailSummary): string {
  return `*${firstName}* marked *${trail.activityName}* ${trailWhere(trail)} as with the client.`;
}

export function returnedText(firstName: string, trail: TrailSummary): string {
  return `*${firstName}* took *${trail.activityName}* ${trailWhere(trail)} back from the client.`;
}

export function openedText(firstName: string, trail: TrailSummary): string {
  if (trail.currentLeg === null) {
    return `*${firstName}* queued *${trail.activityName}* ${trailWhere(trail)} — not started yet.`;
  }
  const holder = trail.holderName ?? "nobody named";
  return `*${firstName}* opened *${trail.activityName}* ${trailWhere(trail)} — leg ${trail.currentLeg} of ${trail.legCount}${trailLegPart(trail)}, with ${holder}.`;
}

export function doneText(): string {
  return "Done.";
}

export function cannotActNow(): string {
  return "I couldn't act as you just now. Please try again in a moment.";
}

export function newTrailNeedsDialog(): string {
  return "The /newtrail command needs 'Opens a dialog' ticked in the Chat app's configuration — an admin can do that in the Google Cloud console.";
}
