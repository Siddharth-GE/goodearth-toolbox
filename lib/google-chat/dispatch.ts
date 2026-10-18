import "server-only";

import {
  COMMANDS,
  buttonParams,
  commandId,
  commandText,
  dialogEventType,
  formValue,
  isDirectMessage,
  messageName,
  senderName,
  spaceDisplayName,
  spaceName,
  type ChatEvent,
} from "@/lib/google-chat/events";
import {
  askForWords,
  bounceDialog,
  bouncedText,
  cannotActNow,
  courtCard,
  customDepartmentsNote,
  dialogNotEnabled,
  dmCannotLink,
  doneText,
  finishedText,
  greeting,
  heldText,
  identityRefusal,
  joinHello,
  linkConfirmation,
  linkDialog,
  linkSaveFailed,
  newTrailDialog,
  newTrailNeedsDialog,
  noticeDialog,
  openedText,
  pushedText,
  returnedText,
  trailCard,
  trailStepsDialog,
} from "@/lib/google-chat/cards";
import { actAs } from "@/lib/google-chat/act-as";
import { resolveIdentity } from "@/lib/google-chat/identity";
import { updateCardMessage } from "@/lib/google-chat/outbound";
import {
  getTrailSummary,
  listActivities,
  listCourt,
  listLegs,
  listPeople,
  listRunning,
  listTrailSets,
  readSetSteps,
} from "@/lib/google-chat/relay-reads";
import {
  bounceBaton,
  clientReturned,
  finishTrail,
  holdForClient,
  openTrail,
  openTrailFromSet,
  pushBaton,
  type WriteResult,
} from "@/lib/google-chat/relay-writes";
import {
  bounceReasonText,
  matchesWords,
  orderColdestFirst,
  parseBounceForm,
  parseButton,
  parseNewTrailPage,
  parseTrailSteps,
  scopeOf,
  searchWords,
  splitByScope,
  takeForCard,
  CUSTOM_SET,
  type ActivityOption,
  type StepDefault,
  type TrailSummary,
} from "@/lib/google-chat/trail-rules";
import {
  linkTargetRows,
  matchSpaceName,
  parseLinkValue,
  projectLabel,
  unitLabel,
  unitRows,
  NO_LINK_VALUE,
} from "@/lib/google-chat/space-match";
import { getSpaceLink, linkSpace, listLinkTargets, unlinkSpace } from "@/lib/google-chat/spaces";
import { chatAudience, chatOrigin } from "@/lib/google-chat/verify";

// Everything the door does once Google is proven. Lives here, not in the route
// file, because a route may export nothing but handlers.

// Google shows "Relay not responding" if the message isn't inside this action
// envelope. With `privateTo` the reply is visible to that person only.
type CardMessage = {
  text?: string;
  cardsV2?: Record<string, unknown>[];
  privateMessageViewer?: { name: string };
};

function card(
  body: string | { text?: string; cardsV2?: Record<string, unknown>[] },
  privateTo?: string | null,
) {
  const message: CardMessage = typeof body === "string" ? { text: body } : { ...body };
  if (privateTo) message.privateMessageViewer = { name: privateTo };
  return Response.json({
    hostAppDataAction: {
      chatDataAction: { createMessageAction: { message } },
    },
  });
}

// A dialog is a navigation, not a message envelope; wrapped in the envelope it never appears.
function pushCard(cardBody: Record<string, unknown>) {
  return Response.json({ action: { navigations: [{ pushCard: cardBody }] } });
}

// Replaces the open dialog (the next page), so no state is kept between pages (trap (j)).
function updateCard(cardBody: Record<string, unknown>) {
  return Response.json({ action: { navigations: [{ updateCard: cardBody }] } });
}

// Google accepts exactly three shapes, never a mix: the message envelope alone
// (closes the dialog and posts), a `notification` toast on the close navigation
// (private), or the close navigation alone. Mixing shows "Could not load dialog".
function closeDialog(text?: string, privateTo?: string | null) {
  if (text && !privateTo) return card(text);
  const body: Record<string, unknown> = {
    action: { navigations: [{ endNavigation: { action: "CLOSE_DIALOG" } }] },
  };
  if (text) (body.action as Record<string, unknown>).notification = { text };
  return Response.json(body);
}

const SOMETHING_WENT_WRONG = "Something went wrong on our side. Please try again in a moment.";

// Command ids as declared in the Chat app's configuration (events.ts holds the list).
const COURT_COMMAND_ID = 1;
const PUSH_COMMAND_ID = 2;
const BOUNCE_COMMAND_ID = 3;
const FINISH_COMMAND_ID = 4;
const TRAIL_COMMAND_ID = 5;
const NEWTRAIL_COMMAND_ID = 6;
const LINK_COMMAND_ID = 7;

const DM_HELLO =
  "Hello! I'm the Relay bot. Try /court to see what's in your hand, " +
  "or /trail followed by a villa name.";

// Bot added somewhere. A confident single match of the space name is linked with no
// identity check (whoever can add the bot can let it read the name); anything less
// is left unlinked and said out loud, so /link is the next move.
async function handleJoin(event: ChatEvent, spaceId: string) {
  if (isDirectMessage(event)) return card(DM_HELLO);

  const displayName = spaceDisplayName(event);
  const targets = await listLinkTargets();
  if (!targets) return card(joinHello(null));

  const match = matchSpaceName(displayName, targets.units, targets.projects);
  let projectId: string | null = null;
  let unitId: string | null = null;
  let label: string | null = null;

  if (match.kind === "unit") {
    const unit = targets.units.find((candidate) => candidate.id === match.unitId);
    const project = targets.projects.find((candidate) => candidate.id === match.projectId);
    if (unit && project) {
      projectId = project.id;
      unitId = unit.id;
      label = unitLabel(project.name, unit.name);
    }
  } else if (match.kind === "project") {
    const project = targets.projects.find((candidate) => candidate.id === match.projectId);
    if (project) {
      projectId = project.id;
      label = projectLabel(project.name);
    }
  }

  if (!projectId || !label) return card(joinHello(null));

  const saved = await linkSpace({
    spaceId,
    spaceName: displayName || null,
    projectId,
    unitId,
    linkedBy: null,
  });
  // Never announce a link that isn't stored.
  return card(saved ? joinHello(label) : joinHello(null));
}

// The confirmation is public (a space's scope is its business); an apology stays private.
async function handleLinkSubmit(
  event: ChatEvent,
  spaceId: string,
  linkedBy: string,
  privateTo: string | null,
) {
  const choice = parseLinkValue(formValue(event, "target"));
  if (!choice) return closeDialog(linkSaveFailed(), privateTo);

  if (choice.kind === "none") {
    const cleared = await unlinkSpace(spaceId);
    return cleared ? closeDialog(linkConfirmation(null)) : closeDialog(linkSaveFailed(), privateTo);
  }

  // A villa's project comes from the list; the stored row must name both.
  const targets = await listLinkTargets();
  if (!targets) return closeDialog(linkSaveFailed(), privateTo);

  let projectId: string | null = null;
  let unitId: string | null = null;
  let label: string | null = null;

  if (choice.kind === "unit") {
    const unit = targets.units.find((candidate) => candidate.id === choice.id);
    const project = unit
      ? targets.projects.find((candidate) => candidate.id === unit.projectId)
      : undefined;
    if (unit && project) {
      projectId = project.id;
      unitId = unit.id;
      label = unitLabel(project.name, unit.name);
    }
  } else {
    const project = targets.projects.find((candidate) => candidate.id === choice.id);
    if (project) {
      projectId = project.id;
      label = projectLabel(project.name);
    }
  }

  // A target that no longer exists is an apology, not a guess.
  if (!projectId || !label) return closeDialog(linkSaveFailed(), privateTo);

  const saved = await linkSpace({
    spaceId,
    spaceName: spaceDisplayName(event) || null,
    projectId,
    unitId,
    linkedBy,
  });
  return saved ? closeDialog(linkConfirmation(label)) : closeDialog(linkSaveFailed(), privateTo);
}

async function handleLinkCommand(event: ChatEvent, spaceId: string, privateTo: string | null) {
  // Once Google asks for a dialog every answer must be a dialog, else "Could not load dialog".
  if (dialogEventType(event) !== "REQUEST_DIALOG") return card(dialogNotEnabled(), privateTo);
  if (isDirectMessage(event)) return pushCard(noticeDialog(dmCannotLink()));

  const targets = await listLinkTargets();
  if (!targets) return pushCard(noticeDialog(SOMETHING_WENT_WRONG));

  const current = await getSpaceLink(spaceId);
  const selected = current
    ? current.unitId
      ? `unit:${current.unitId}`
      : `project:${current.projectId}`
    : NO_LINK_VALUE;

  // For an HTTP app a button's function is a URL: the registered endpoint, chatAudience().
  return pushCard(
    linkDialog(linkTargetRows(targets.projects, targets.units), selected, chatAudience()),
  );
}

// The one court renderer, so /court and a self-rewriting card can't drift apart.
// Reads unscoped and splits by scope in Node, so a linked space can also say "you hold N
// elsewhere". Null is a failed read, never an empty court: "nothing waiting" would be a
// lie to someone holding six batons.
async function buildCourtCards(
  spaceId: string,
  identity: { userId: string; firstName: string },
  notice?: string,
): Promise<Record<string, unknown>[] | null> {
  const link = await getSpaceLink(spaceId);
  const scope = scopeOf(link);

  const rows = await listCourt(identity.userId);
  if (!rows) return null;

  const { inScope, elsewhere } = splitByScope(rows, scope);
  const { shown, more } = takeForCard(orderColdestFirst(inScope));

  // Counted over every in-scope row, so a cold trail cut by the ten-cap still shows.
  const coldCount = inScope.filter((row) => row.isStuck).length;
  const withClientCount = inScope.filter((row) => row.isWithClient).length;

  return [
    courtCard({
      firstName: identity.firstName,
      scopeLabel: link?.label ?? null,
      rows: shown,
      more,
      moreElsewhere: elsewhere.length,
      origin: chatOrigin(),
      // Where Google posts a button press back (a URL, never a name: trap (e)).
      submitUrl: chatAudience(),
      notice,
      coldCount,
      withClientCount,
    }),
  ];
}

// /push, /bounce and /finish answer with this same card: the buttons live on its rows.
async function handleCourt(
  spaceId: string,
  identity: { userId: string; firstName: string },
  privateTo: string | null,
) {
  const cards = await buildCourtCards(spaceId, identity);
  if (!cards) return card(SOMETHING_WENT_WRONG, privateTo);
  return card({ cardsV2: cards }, privateTo);
}

// Rewrites the pressed card through the Chat REST API (Google takes one answer per press
// and that stays the public confirmation). Every failure ends in a log line and an
// untouched card. The message name is logged on purpose: it is an opaque handle, and it
// lets scripts/google-chat-patch-card.ts fix a card by hand.
async function refreshPressedCard(
  event: ChatEvent,
  spaceId: string,
  actor: Actor,
  notice: string,
): Promise<void> {
  const name = messageName(event);
  if (!name) {
    console.log("google-chat refresh", JSON.stringify({ space: spaceId, message: null }));
    return;
  }

  try {
    const cards = await buildCourtCards(spaceId, actor, notice);
    const result = cards ? await updateCardMessage(name, cards) : "skipped";
    console.log("google-chat refresh", JSON.stringify({ space: spaceId, message: name, result }));
  } catch {
    console.log(
      "google-chat refresh",
      JSON.stringify({ space: spaceId, message: name, result: "failed:threw" }),
    );
  }
}

// Matching happens in Node on rows the view returned: a PostgREST filter built from
// typed words is something no CI gate can see through. No words and no scope asks for
// a word rather than dumping every running trail.
async function handleTrail(event: ChatEvent, spaceId: string, privateTo: string | null) {
  const words = searchWords(commandText(event));
  const link = await getSpaceLink(spaceId);
  const scope = scopeOf(link);

  if (words.length === 0 && scope.kind === "all") return card(askForWords(), privateTo);

  const rows = await listRunning(scope);
  if (!rows) return card(SOMETHING_WENT_WRONG, privateTo);

  const matched = orderColdestFirst(rows.filter((row) => matchesWords(row, words)));
  const { shown, more } = takeForCard(matched);

  const coldCount = matched.filter((row) => row.isStuck).length;
  const withClientCount = matched.filter((row) => row.isWithClient).length;

  return card(
    {
      cardsV2: [
        trailCard({
          words,
          scopeLabel: link?.label ?? null,
          rows: shown,
          more,
          origin: chatOrigin(),
          coldCount,
          withClientCount,
        }),
      ],
    },
    privateTo,
  );
}

// The email rides with the id: act-as.ts mints the session from it, then refuses a client
// unless the account that came back is this exact id.
type Actor = { userId: string; email: string; firstName: string };

function confirmation(action: string, firstName: string, trail: TrailSummary): string {
  if (action === "push") return pushedText(firstName, trail);
  if (action === "finish") return finishedText(firstName, trail);
  if (action === "hold") return heldText(firstName, trail);
  return returnedText(firstName, trail);
}

// Push, Finish, With client, Back from client. A refusal is private (it is between the
// person and the rule); success is told to the whole space. Bounce never arrives here:
// its button is OPEN_DIALOG.
async function handleButtonPress(event: ChatEvent, actor: Actor, privateTo: string | null) {
  const press = parseButton(buttonParams(event));
  // An unknown button gets a well-formed empty answer and the space stays quiet.
  if (!press) return Response.json({});
  if (press.action === "bounce") return Response.json({});

  const acted = await actAs({ userId: actor.userId, email: actor.email }, (db) => {
    const { chainId, fromLeg } = press;
    if (press.action === "push") return pushBaton(db, chainId, fromLeg);
    if (press.action === "finish") return finishTrail(db, chainId, fromLeg);
    if (press.action === "hold") return holdForClient(db, chainId, fromLeg);
    return clientReturned(db, chainId, fromLeg);
  });

  if (!acted.ok) return card(cannotActNow(), privateTo);
  const result: WriteResult = acted.value;
  if (!result.ok) return card(result.error, privateTo);

  // Read after the write so the sentence names the leg moved to. If the read fails the
  // write still happened, so say so plainly.
  const trail = await getTrailSummary(press.chainId);
  const sentence = trail ? confirmation(press.action, actor.firstName, trail) : doneText();

  // Awaited so it lands before the answer; its outcome never changes the answer.
  await refreshPressedCard(event, spaceName(event), actor, sentence);

  return card(sentence);
}

// Every answer to a dialog request must be a dialog (trap (f)), so even a failed read
// is a notice card. A bounce goes backwards: only legs before the current one.
async function handleBounceDialog(event: ChatEvent) {
  const press = parseButton(buttonParams(event));
  if (!press) return pushCard(noticeDialog(SOMETHING_WENT_WRONG));

  const [legs, trail] = await Promise.all([
    listLegs(press.chainId),
    getTrailSummary(press.chainId),
  ]);
  if (!legs || !trail) return pushCard(noticeDialog(SOMETHING_WENT_WRONG));

  return pushCard(
    bounceDialog({
      trail,
      legs: legs.filter((leg) => leg.legNo < press.fromLeg),
      submitUrl: chatAudience(),
    }),
  );
}

// The same three checks as the app's form; the database refuses all three again (0036 §6).
async function handleBounceSubmit(event: ChatEvent, actor: Actor, privateTo: string | null) {
  const press = parseButton(buttonParams(event));
  if (!press) return closeDialog(SOMETHING_WENT_WRONG, privateTo);

  const form = parseBounceForm(
    {
      toLeg: formValue(event, "to_leg"),
      reason: formValue(event, "reason"),
      note: formValue(event, "note"),
    },
    press.fromLeg,
  );
  if (!form.ok) return closeDialog(form.error, privateTo);

  const acted = await actAs({ userId: actor.userId, email: actor.email }, (db) =>
    bounceBaton(db, press.chainId, press.fromLeg, form.toLeg, form.reason, form.note),
  );
  if (!acted.ok) return closeDialog(cannotActNow(), privateTo);
  if (!acted.value.ok) return closeDialog(acted.value.error, privateTo);

  const trail = await getTrailSummary(press.chainId);
  const sentence = trail
    ? bouncedText(actor.firstName, trail, bounceReasonText(form.reason), form.note)
    : doneText();

  // A dialog Save may carry no card name; then the refresh logs `message: null` and skips.
  await refreshPressedCard(event, spaceName(event), actor, sentence);

  return closeDialog(sentence);
}

// Needs "Opens a dialog" ticked in Google's console. A project-linked space pre-selects
// nothing: a project is not a house to put a trail on.
async function handleNewTrailCommand(event: ChatEvent, spaceId: string, privateTo: string | null) {
  if (dialogEventType(event) !== "REQUEST_DIALOG") return card(newTrailNeedsDialog(), privateTo);

  const [targets, sets, link] = await Promise.all([
    listLinkTargets(),
    listTrailSets(),
    getSpaceLink(spaceId),
  ]);
  if (!targets || !sets) return pushCard(noticeDialog(SOMETHING_WENT_WRONG));

  return pushCard(
    newTrailDialog({
      units: unitRows(targets.projects, targets.units),
      sets,
      selectedUnit: link?.unitId ?? null,
      submitUrl: chatAudience(),
    }),
  );
}

// The one-tap open: a trail type with its usual people, as the person. Also the road for
// a type with no steps, whose refusal is this path's own.
async function openFromSetNow(
  actor: Actor,
  input: { unitId: string; setId: string; start: boolean },
  privateTo: string | null,
) {
  const acted = await actAs({ userId: actor.userId, email: actor.email }, (db) =>
    openTrailFromSet(db, input),
  );
  if (!acted.ok) return closeDialog(cannotActNow(), privateTo);
  if (!acted.value.ok) return closeDialog(acted.value.error, privateTo);

  const chainId = acted.value.chainId;
  const trail = chainId ? await getTrailSummary(chainId) : null;
  if (!trail) return closeDialog(doneText());
  return closeDialog(openedText(actor.firstName, trail));
}

// Page 2 is rebuilt from scratch each time because the door remembers nothing between
// pages. `error` and `values` re-show a page-2 refusal on the page itself (a toast is
// not a warning). A read that failed is ours to apologise for; an empty type is the
// one-tap path's refusal, so the caller is told which.
type StepsPage =
  { ok: true; card: Record<string, unknown> } | { ok: false; reason: "read-failed" | "empty-set" };

async function buildStepsPage(input: {
  mode: "set" | "custom";
  unitId: string;
  setId: string | null;
  start: boolean;
  customSteps: number;
  error?: string | null;
  values?: Record<string, string | null>;
}): Promise<StepsPage> {
  const { mode, unitId, setId, start, customSteps, error, values } = input;

  const people = await listPeople();
  if (!people) return { ok: false, reason: "read-failed" };

  let steps: StepDefault[] = [];
  let activities: ActivityOption[] = [];

  if (mode === "custom") {
    const list = await listActivities();
    if (!list) return { ok: false, reason: "read-failed" };
    activities = list;
  } else {
    // Pre-filled as the one-tap path would: the activity's usual person and the type's
    // days. A step nobody has carried leaves the person unchosen.
    const set = await readSetSteps(setId as string);
    if (!set) return { ok: false, reason: "read-failed" };
    steps = set.steps;
    if (steps.length === 0) return { ok: false, reason: "empty-set" };
  }

  return {
    ok: true,
    card: trailStepsDialog({
      mode,
      steps,
      people,
      activities,
      customSteps,
      // Page 1's answers ride on the Open button's own parameters.
      params: { unit: unitId, set: setId ?? CUSTOM_SET, start },
      submitUrl: chatAudience(),
      error,
      values,
    }),
  };
}

// Page 1 of /newtrail. A standard type with its usual people opens here and now; anything
// else answers with page 2. Page 2's lists come through relay-reads.ts (admin client): they
// are cards being drawn, not writes, and identity already proved this person holds /relay.
// The write that follows is made as them through a minted session.
async function handleNewTrailSubmit(event: ChatEvent, actor: Actor, privateTo: string | null) {
  const page = parseNewTrailPage({
    unit: formValue(event, "unit"),
    set: formValue(event, "set"),
    steps: formValue(event, "steps"),
    // A switch sends its value when on and nothing when off: "absent" is a real answer.
    pickPeople: formValue(event, "pick_people"),
    start: formValue(event, "start"),
  });
  if (!page.ok) return closeDialog(page.error, privateTo);

  const setId = page.custom ? null : page.setId;

  if (setId && !page.pickPeople) {
    return await openFromSetNow(
      actor,
      { unitId: page.unitId, setId, start: page.start },
      privateTo,
    );
  }

  // Any failed read here is a notice card in the open dialog, never a message envelope.
  const built = await buildStepsPage({
    mode: page.custom ? "custom" : "set",
    unitId: page.unitId,
    setId,
    start: page.start,
    customSteps: page.steps,
  });

  // A type with no steps would give an empty page 2; the one-tap path says why instead.
  if (!built.ok && built.reason === "empty-set") {
    return await openFromSetNow(
      actor,
      { unitId: page.unitId, setId: setId as string, start: page.start },
      privateTo,
    );
  }
  if (!built.ok) return updateCard(noticeDialog(SOMETHING_WENT_WRONG));

  return updateCard(built.card);
}

// Page 2. The door remembers nothing: house, type and start ride on the Open button's
// parameters. Every refusal keeps the dialog OPEN with the sentence on the page, never a
// toast; only the confirmation closes it.
async function handleTrailStepsSubmit(event: ChatEvent, actor: Actor, privateTo: string | null) {
  const params = buttonParams(event);
  const mode = params.mode === "custom" ? "custom" : "set";
  const unitId = params.unit ?? "";
  const set = params.set ?? "";
  const count = Number(params.count);
  const start = params.start === "on";
  // Set mode shows activities as labels, so the button carries them.
  const activityIds = params.activities ? params.activities.split(",") : undefined;

  // Parameters that didn't survive are not guessed at: nothing is written.
  if (!unitId || !set || !Number.isInteger(count) || count < 1) {
    return closeDialog(SOMETHING_WENT_WRONG, privateTo);
  }

  const values: Record<string, string | null> = { title: formValue(event, "title") };
  for (let step = 1; step <= count; step += 1) {
    values[`activity_${step}`] = formValue(event, `activity_${step}`);
    values[`person_${step}`] = formValue(event, `person_${step}`);
    values[`days_${step}`] = formValue(event, `days_${step}`);
  }

  // Rebuilds this page around the refusal, every box as the person left it.
  const again = async (error: string) => {
    const built = await buildStepsPage({
      mode,
      unitId,
      setId: set === CUSTOM_SET ? null : set,
      start,
      customSteps: count,
      error,
      values,
    });
    if (!built.ok) return updateCard(noticeDialog(SOMETHING_WENT_WRONG));
    return updateCard(built.card);
  };

  const parsed = parseTrailSteps(values, { mode, count, activityIds });
  if (!parsed.ok) return await again(parsed.error);

  const acted = await actAs({ userId: actor.userId, email: actor.email }, (db) =>
    openTrail(db, {
      unitId,
      setId: set === CUSTOM_SET ? null : set,
      // A type's trail takes the type's name; only a custom trail carries a title.
      title: mode === "custom" ? parsed.title : null,
      legs: parsed.legs,
      start,
    }),
  );
  if (!acted.ok) return await again(cannotActNow());
  if (!acted.value.ok) return await again(acted.value.error);

  const chainId = acted.value.chainId;
  const trail = chainId ? await getTrailSummary(chainId) : null;
  if (!trail) return closeDialog(doneText());

  // A custom trail has no earlier one to copy department tags from.
  const opened = openedText(actor.firstName, trail);
  return closeDialog(mode === "custom" ? `${opened} ${customDepartmentsNote()}` : opened);
}

// The door from the moment Google is proven; the usage-test script calls it with a hand-built event.
export async function handleChatRequest(request: Request): Promise<Response> {
  try {
    const event = (await request.json().catch(() => null)) as ChatEvent | null;
    if (!event) return card("I couldn't read that message. Please try again.");

    // Optional: when set, only listed spaces get answers.
    const chat = event.chat ?? {};
    const allowedSpaces = (process.env.GOOGLE_CHAT_ALLOWED_SPACES ?? "")
      .split(",")
      .map((space) => space.trim())
      .filter(Boolean);
    const spaceId = spaceName(event);

    // One log line per event; never the message text, never the email.
    const logEvent = (sender: string | null) =>
      console.log(
        "google-chat event",
        JSON.stringify({
          kind: chat.appCommandPayload
            ? "command"
            : chat.messagePayload
              ? "message"
              : chat.buttonClickedPayload
                ? "button"
                : chat.addedToSpacePayload
                  ? "added"
                  : chat.removedFromSpacePayload
                    ? "removed"
                    : "other",
          space: spaceId,
          commandId: chat.appCommandPayload?.appCommandMetadata?.appCommandId ?? null,
          commandType: chat.appCommandPayload?.appCommandMetadata?.appCommandType ?? null,
          slashCommandInMessage: chat.messagePayload?.message?.slashCommand?.commandId ?? null,
          // Says whether "Opens a dialog" is ticked in Google's console.
          dialog: dialogEventType(event),
          // Whether a refresh has the card's handle; false on anything but a button.
          messageName: messageName(event) !== null,
          sender,
        }),
      );

    if (allowedSpaces.length > 0 && !allowedSpaces.includes(spaceId)) {
      logEvent(null);
      return card("This space isn't set up for Relay yet.");
    }

    // Joining and leaving are the space's business, so they cost no lookup.
    const identity =
      chat.messagePayload || chat.appCommandPayload || chat.buttonClickedPayload
        ? await resolveIdentity(event)
        : null;
    logEvent(identity?.kind ?? null);

    if (chat.addedToSpacePayload) return await handleJoin(event, spaceId);

    if (identity) {
      // Anyone the toolbox can't act for gets one of five fixed private sentences, never
      // anything revealing who has an account. Inside a dialog the refusal shuts it too.
      const privateTo = senderName(event);
      if (identity.kind !== "ok") {
        const refusal = identityRefusal(identity.kind);
        // A dialog request must be answered with a dialog.
        if (dialogEventType(event) === "REQUEST_DIALOG") return pushCard(noticeDialog(refusal));
        return chat.buttonClickedPayload
          ? closeDialog(refusal, privateTo)
          : card(refusal, privateTo);
      }

      // The email is the one Google vouched for; act-as.ts checks the minted account has this id.
      const actor: Actor = {
        userId: identity.userId,
        email: identity.email,
        firstName: identity.firstName,
      };

      // A card button or a dialog's Save; the button's parameters name its action.
      if (chat.buttonClickedPayload) {
        const step = dialogEventType(event);
        if (step === "SUBMIT_DIALOG") {
          const action = buttonParams(event).action;
          if (action === "link") {
            return await handleLinkSubmit(event, spaceId, identity.userId, privateTo);
          }
          if (action === "bounce") return await handleBounceSubmit(event, actor, privateTo);
          if (action === "newtrail") return await handleNewTrailSubmit(event, actor, privateTo);
          if (action === "newtrail-open") {
            return await handleTrailStepsSubmit(event, actor, privateTo);
          }
          // An unknown Save must still shut the dialog.
          return closeDialog();
        }
        if (step === "CANCEL_DIALOG") return closeDialog();
        // Bounce is the only button declared OPEN_DIALOG.
        if (step === "REQUEST_DIALOG") return await handleBounceDialog(event);
        return await handleButtonPress(event, actor, privateTo);
      }

      // A slash command arrives as appCommandPayload; the older shape tags the message.
      const id = commandId(event);
      if (chat.appCommandPayload || id !== null) {
        const command = (id !== null && COMMANDS[id]) || "that command";
        if (id === LINK_COMMAND_ID) return await handleLinkCommand(event, spaceId, privateTo);

        // /push, /bounce and /finish are the court card: its row buttons answer them.
        if (
          id === COURT_COMMAND_ID ||
          id === PUSH_COMMAND_ID ||
          id === BOUNCE_COMMAND_ID ||
          id === FINISH_COMMAND_ID
        ) {
          return await handleCourt(spaceId, identity, privateTo);
        }
        if (id === TRAIL_COMMAND_ID) return await handleTrail(event, spaceId, privateTo);
        if (id === NEWTRAIL_COMMAND_ID) {
          return await handleNewTrailCommand(event, spaceId, privateTo);
        }

        return card(greeting(identity.firstName, command), privateTo);
      }
      return card(greeting(identity.firstName, null), privateTo);
    }

    // Removal and unknown kinds: an empty envelope is a well-formed answer.
    return Response.json({});
  } catch (error) {
    console.error("google-chat handler failed", error);
    return card(SOMETHING_WENT_WRONG);
  }
}
