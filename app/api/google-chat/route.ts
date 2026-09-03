import {
  COMMANDS,
  buttonParams,
  commandId,
  commandText,
  dialogEventType,
  formValue,
  isDirectMessage,
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
import {
  chatAudience,
  chatOrigin,
  chatServiceAgent,
  getGoogleKeys,
  verifyChatToken,
} from "@/lib/google-chat/verify";

/**
 * The Google Chat door — the app's first unauthenticated POST endpoint.
 *
 * There is no browser session here by design: Google posts events
 * directly. The gate is the Google-signed JWT on every request, verified
 * before the body is read; the proxy's PUBLIC_PATHS entry only stops the
 * login redirect from eating the request first.
 *
 * Phase 3 adds the second trust step: once Google is proven, the person
 * behind the message is mapped to a toolbox account (identity.ts), and
 * anyone the toolbox doesn't know — or doesn't hold /relay for — gets a
 * polite refusal, privately. Still no relay reads or writes; those
 * arrive phase by phase behind these two checks (plan.md at the repo
 * root).
 *
 * Phase 4 teaches a space which villa or project it is for: the bot
 * matches the space's name against the villas and projects when it
 * joins, and /link opens a dialog to set or change that.
 *
 * Phase 5 puts that link to work and answers the two questions that
 * touch nothing: /court ("what is in my hand?") and /trail <words>
 * ("where is that trail?"). Both are private cards built from
 * pusher_chain_state — the same view every relay list reads, so the
 * chat answer and the app's court can never disagree — narrowed to the
 * space's villa or project when there is one, spanning everything in a
 * DM or an unlinked space. /push, /bounce and /finish answer with the
 * same court card.
 *
 * Phases 6 and 7 put buttons on that card and a /newtrail dialog beside
 * it, and with them the door's third trust step. A button press is
 * never written as the app: act-as.ts mints a short-lived real session
 * for the person who pressed it, the write goes through a client bound
 * to that session, and the session is deleted and revoked immediately
 * after. So the relay's own database guard (0036) is still what decides
 * whether the push is allowed, and the event carries the real person's
 * name — chat can do exactly what that person could do at their own
 * keyboard, and nothing more.
 *
 * Phase 7b gives /newtrail a second page: a trail type whose people you
 * pick yourself, or a custom trail whose steps you choose outright. The
 * door remembers nothing between the two pages — what page 1 decided
 * rides back on page 2's Open button — and both roads end in the same
 * single write path, as the person, through the same minted session.
 *
 * Which way an answer goes is the founder's settled rule: a
 * confirmation is the space's business and posts publicly ("Sid pushed
 * … to leg 3"), while a refusal — the guard's own sentence, or "I
 * couldn't act as you just now" — is nobody else's and stays private to
 * whoever pressed the button.
 */

/**
 * An add-on-style synchronous reply: the message rides inside an action
 * envelope, not as bare `{ text }` — Google shows "Relay not responding"
 * if the envelope is missing, even on a 200.
 *
 * Given a sender's `users/<id>` name, the reply is private to them.
 * Everything that is about one person — a refusal, a greeting, a
 * lookup — goes back privately; only what the whole space should see
 * (the hello on joining, later the action confirmations) goes public.
 *
 * A plain string is a plain text reply, exactly as it has always been.
 * Phase 5 lets the same envelope carry a card instead — or both — by
 * passing `{ text, cardsV2 }`: Google's message resource takes the
 * cards beside the text, and `privateMessageViewer` still applies to
 * the whole message. That last part is a belief until it is seen: the
 * first /court typed on staging is what proves a cardsV2 card renders
 * inside createMessageAction AND stays private (plan.md's step 1 — the
 * answer, whichever way it goes, becomes trap (h) in plan.md).
 */
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

/**
 * A dialog, as an add-on-style app answers one: a navigation that
 * pushes a card, and no message envelope at all. The two shapes are not
 * interchangeable — a dialog wrapped in the hostAppDataAction envelope
 * the text replies use simply never appears.
 */
function pushCard(cardBody: Record<string, unknown>) {
  return Response.json({ action: { navigations: [{ pushCard: cardBody }] } });
}

/**
 * The next page of a dialog that is already open — the answer to a Save
 * that isn't finished yet. `pushCard` opens a dialog; `updateCard`
 * replaces what is in the one the person is looking at, which is how
 * /newtrail's second page (the steps, the people, the days) appears
 * without the door having to remember anything between the two: page 1's
 * answers ride back on the Open button's own parameters.
 *
 * This is plan.md's trap (j), and it is a belief until the founder's
 * vet: whether Google accepts `updateCard` in reply to a SUBMIT_DIALOG
 * at all, and whether the Open button's parameters come back beside page
 * 2's form values. If it doesn't, this is the one line that changes.
 */
function updateCard(cardBody: Record<string, unknown>) {
  return Response.json({ action: { navigations: [{ updateCard: cardBody }] } });
}

/**
 * Shut the dialog, optionally saying something as it goes. Google gives
 * the app one answer and one only, and — learned on the second vet,
 * 2026-09-02 — it accepts exactly three shapes here, never a mix:
 *
 *   - a message to the space closes the dialog by itself: the
 *     hostAppDataAction envelope ALONE, with no navigation beside it
 *     (the two together are "invalid" and show "Could not load dialog");
 *   - a private word to the person is a `notification` toast on the
 *     close navigation — visible to them only, nothing posted;
 *   - a plain close is the navigation alone.
 *
 * So the public confirmation is the first shape, and a refusal or an
 * apology (nobody else's business) is the second.
 */
function closeDialog(text?: string, privateTo?: string | null) {
  if (text && !privateTo) return card(text);
  const body: Record<string, unknown> = {
    action: { navigations: [{ endNavigation: { action: "CLOSE_DIALOG" } }] },
  };
  if (text) (body.action as Record<string, unknown>).notification = { text };
  return Response.json(body);
}

// The one sentence the door falls back on when something on our side
// broke. It is said in two places — the outer catch, and the dialog
// that can't be built without its list — so it is written once.
const SOMETHING_WENT_WRONG = "Something went wrong on our side. Please try again in a moment.";

// The commands this file dispatches on, as declared in the Chat app's
// configuration (events.ts holds the whole id list, and Google sends
// only the number). Named here so the dispatch reads as commands rather
// than as arithmetic.
const COURT_COMMAND_ID = 1;
const PUSH_COMMAND_ID = 2;
const BOUNCE_COMMAND_ID = 3;
const FINISH_COMMAND_ID = 4;
const TRAIL_COMMAND_ID = 5;
const NEWTRAIL_COMMAND_ID = 6;
const LINK_COMMAND_ID = 7;

// The hello a DM gets on joining. There is nothing to link in a DM, so
// instead of a space's scope it names the two commands that answer a
// question outright — the moving of batons starts from the court card's
// own buttons.
const DM_HELLO =
  "Hello! I'm the Relay bot. Try /court to see what's in your hand, " +
  "or /trail followed by a villa name.";

/**
 * The bot has just been added somewhere. In a DM there is nothing to
 * work out; in a space, the space's name is matched against every villa
 * and then every project, and a confident single match is linked there
 * and then — no identity check, because whoever can add the bot to a
 * space can let it read that space's name.
 *
 * Anything less than confident (nothing matched, or several did) is
 * left unlinked and said out loud, so /link is the obvious next move.
 */
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
  // A failed write must not announce a link that isn't stored: the
  // space would then think it was scoped and the database wouldn't.
  return card(saved ? joinHello(label) : joinHello(null));
}

/**
 * The /link dialog came back. The dropdown's value is the whole answer:
 * "none" forgets the link, "project:<id>" or "unit:<id>" stores it
 * against the person who chose it. The confirmation is public — a
 * space's scope is the space's business — while an apology stays
 * private to whoever pressed Save.
 */
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

  // A villa's project comes from the list, not from the dialog: a row
  // names one id, and the stored row must name both.
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

  // A row naming something that is no longer there — a dialog left open
  // while a villa was renamed away — is an apology, not a guess.
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

/**
 * /link itself: the picker. A DM can't be linked; a space gets Google's
 * dialog, with the current choice pre-selected. If the command didn't
 * arrive as a dialog request at all, the console's "Opens a dialog"
 * tick is missing — the door says exactly that rather than answering
 * with a card Google will drop on the floor.
 */
async function handleLinkCommand(event: ChatEvent, spaceId: string, privateTo: string | null) {
  // Google asked for a dialog, so from here on every answer IS a dialog:
  // a message envelope in reply to a dialog request is "invalid" and
  // shows as "Could not load dialog" (the first vet, /link in a DM).
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

  // The Save button posts back to the door itself: for an HTTP app the
  // button's function is a URL, and the registered endpoint URL is
  // exactly what chatAudience() holds.
  return pushCard(
    linkDialog(linkTargetRows(targets.projects, targets.units), selected, chatAudience()),
  );
}

/**
 * /court — what is in this person's hand, coldest first, privately.
 *
 * The read is deliberately unscoped: one pass over the person's whole
 * court, split in Node by the space's scope, so a linked space can say
 * both "here is this villa's batons" and "you also hold N elsewhere"
 * without a second query. In a DM or an unlinked space the scope is
 * "all", nothing is split off, and the card is simply the whole court.
 *
 * /push, /bounce and /finish answer with this same card: the buttons
 * that move a baton live on its rows, so "which of these do you mean?"
 * is the honest first question for all four commands.
 */
async function handleCourt(
  spaceId: string,
  identity: { userId: string; firstName: string },
  privateTo: string | null,
) {
  const link = await getSpaceLink(spaceId);
  const scope = scopeOf(link);

  const rows = await listCourt(identity.userId);
  // A read that failed is never an empty court: "nothing is waiting on
  // you" would be a lie told to someone holding six batons.
  if (!rows) return card(SOMETHING_WENT_WRONG, privateTo);

  const { inScope, elsewhere } = splitByScope(rows, scope);
  const { shown, more } = takeForCard(orderColdestFirst(inScope));

  return card(
    {
      cardsV2: [
        courtCard({
          firstName: identity.firstName,
          scopeLabel: link?.label ?? null,
          rows: shown,
          more,
          moreElsewhere: elsewhere.length,
          origin: chatOrigin(),
          // Where Google posts a button press back to. For an HTTP app a
          // button's function is a URL, never a name (trap (e)), and the
          // registered endpoint URL is exactly what chatAudience() holds.
          submitUrl: chatAudience(),
        }),
      ],
    },
    privateTo,
  );
}

/**
 * /trail <words> — where is that trail, privately.
 *
 * The words come from the message the person typed; the space's link
 * narrows the running trails to its villa or project. With no words at
 * all and nothing to narrow by, there is no question to answer, so the
 * bot asks for a word rather than dumping every running trail in the
 * company. Matching happens in Node, on rows the view already returned:
 * a PostgREST filter string built from typed words is exactly the thing
 * no CI gate can see through.
 */
async function handleTrail(event: ChatEvent, spaceId: string, privateTo: string | null) {
  const words = searchWords(commandText(event));
  const link = await getSpaceLink(spaceId);
  const scope = scopeOf(link);

  if (words.length === 0 && scope.kind === "all") return card(askForWords(), privateTo);

  const rows = await listRunning(scope);
  if (!rows) return card(SOMETHING_WENT_WRONG, privateTo);

  const matched = orderColdestFirst(rows.filter((row) => matchesWords(row, words)));
  const { shown, more } = takeForCard(matched);

  return card(
    {
      cardsV2: [
        trailCard({
          words,
          scopeLabel: link?.label ?? null,
          rows: shown,
          more,
          origin: chatOrigin(),
        }),
      ],
    },
    privateTo,
  );
}

/**
 * Everything a write needs to know about who is doing it. The email is
 * carried alongside the id on purpose: act-as.ts mints the session from
 * the email Google vouched for and then refuses to hand back a client
 * unless the account that came back is this exact id.
 */
type Actor = { userId: string; email: string; firstName: string };

/** The public sentence each write earns, once the fresh row is in hand. */
function confirmation(action: string, firstName: string, trail: TrailSummary): string {
  if (action === "push") return pushedText(firstName, trail);
  if (action === "finish") return finishedText(firstName, trail);
  if (action === "hold") return heldText(firstName, trail);
  return returnedText(firstName, trail);
}

/**
 * A button on a court card: Push, Finish, With client, Back from client.
 *
 * Four things happen in order, and each has its own answer. The session
 * can't be minted — private apology. The database refuses (not the
 * holder, the baton has moved, the trail is finished) — the guard's own
 * sentence, privately, because a refusal is between the person and the
 * rule. It worked — the whole space is told, because that is the point
 * of doing this in chat.
 *
 * Bounce never arrives here: its button is declared OPEN_DIALOG, so
 * Google asks for a dialog instead of pressing straight through.
 */
async function handleButtonPress(event: ChatEvent, actor: Actor, privateTo: string | null) {
  const press = parseButton(buttonParams(event));
  // A button this door doesn't know is not an error to announce: Google
  // gets a well-formed empty answer and the space stays quiet.
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

  // The confirmation is built from the trail as it now stands, so it
  // names the leg it has moved to rather than the one it left. If that
  // read fails the write still happened, and saying nothing would be
  // worse than saying it plainly.
  const trail = await getTrailSummary(press.chainId);
  if (!trail) return card(doneText());
  return card(confirmation(press.action, actor.firstName, trail));
}

/**
 * The Bounce button, which opens a dialog rather than acting. From the
 * moment Google asks for one, every answer must BE a dialog (trap (f)),
 * so even a failed read is a one-paragraph notice card.
 *
 * Only legs the trail has already passed can be bounced to — a bounce
 * goes backwards — so the list is cut to those before the current one.
 */
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

/**
 * The bounce dialog came back. The three checks the app makes before its
 * own round trip are made here too — a reason picked, a note that isn't
 * blank, a target the trail has passed — and the database refuses all
 * three again anyway (0036 §6).
 */
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
  if (!trail) return closeDialog(doneText());
  return closeDialog(bouncedText(actor.firstName, trail, bounceReasonText(form.reason), form.note));
}

/**
 * /newtrail — the picker. Like /link it needs "Opens a dialog" ticked on
 * the command in Google's console; without the tick the command arrives
 * as an ordinary one and a dialog answer goes nowhere, so the door says
 * exactly that instead of guessing.
 *
 * A linked space pre-selects its villa. A project-linked space
 * pre-selects nothing — a project is not a house to put a trail on.
 */
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

/**
 * The one-tap open: a trail type laid down with its usual people, as the
 * person, and the public sentence that follows. Its own function because
 * two roads out of page 1 end here — the founder's one tap, and a trail
 * type that turns out to have no steps to put anybody on, whose refusal
 * is the one this path already says in the app's own words.
 */
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

/**
 * Page 2, built from scratch — the lists it needs are read every time,
 * because the door remembers nothing between pages. Two roads reach here:
 * page 1's Save, and a page-2 refusal that has to be shown ON page 2
 * rather than whispered as a toast while the dialog closes (the founder's
 * vet, 2026-09-03: a toast is not a warning). `error` and `values` are
 * what the second road adds — the sentence, and every box as the person
 * left it.
 *
 * Failure has two shapes worth telling apart. A read that didn't answer
 * is ours to apologise for; a trail type with no steps in it is the
 * one-tap path's own refusal, in the app's own words, so this says which
 * happened and lets the caller decide.
 */
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
    // The type's steps, pre-filled the way the one-tap path would have
    // filled them: the activity's usual person, and the days the type
    // itself asks for. A blank person is a step nobody has ever carried
    // — page 2 simply leaves that dropdown unchosen, which is the whole
    // answer to the refusal the one-tap path would have given.
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
      // What page 1 decided, carried on the Open button rather than kept
      // anywhere: the door remembers nothing between the two pages.
      params: { unit: unitId, set: setId ?? CUSTOM_SET, start },
      submitUrl: chatAudience(),
      error,
      values,
    }),
  };
}

/**
 * The /newtrail dialog's FIRST page came back: one house, one trail type
 * (or "custom"), how many steps a custom trail should get, whether to
 * choose the people by hand, and whether to start the clock today.
 *
 * Two roads out. A standard type with its usual people is the one-tap
 * path the founder already has, and it opens the trail here and now —
 * nothing about it changed. Anything else needs to know more than page 1
 * asked, so the answer to this Save is page 2 rather than a trail: the
 * type's steps to put people on, or as many blank steps as page 1's
 * "Steps" dropdown asked for, to build one from scratch.
 *
 * Page 2's lists are read through relay-reads.ts, which holds the admin
 * client as every other read here does — the door itself stays
 * dispatch-only. They are cards being drawn, not writes: the same people
 * and activities the app's own form shows any signed-in person, and the
 * identity step has already proved this person holds /relay. The write
 * that follows is still made as them, through a minted session, like
 * every other write here.
 */

async function handleNewTrailSubmit(event: ChatEvent, actor: Actor, privateTo: string | null) {
  const page = parseNewTrailPage({
    unit: formValue(event, "unit"),
    set: formValue(event, "set"),
    // Only a custom trail uses this; a trail type's own steps decide.
    steps: formValue(event, "steps"),
    // Both switches send their value when on and nothing when off, so
    // "absent" is a real answer here, not a missing one.
    pickPeople: formValue(event, "pick_people"),
    start: formValue(event, "start"),
  });
  if (!page.ok) return closeDialog(page.error, privateTo);

  const setId = page.custom ? null : page.setId;

  // The one-tap path, untouched: a standard type, its usual people, open
  // it now.
  if (setId && !page.pickPeople) {
    return await openFromSetNow(
      actor,
      { unitId: page.unitId, setId, start: page.start },
      privateTo,
    );
  }

  // From here on the answer is page 2. Everything it needs is a read, and
  // any of them failing is a notice card in the dialog that is already
  // open — never a message envelope, which a dialog would drop.
  const built = await buildStepsPage({
    mode: page.custom ? "custom" : "set",
    unitId: page.unitId,
    setId,
    start: page.start,
    customSteps: page.steps,
  });

  // A trail type with nothing in it has no steps to put people on, so
  // page 2 would be an empty form with one button. The one-tap path says
  // why in the app's own words — let it.
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

/**
 * Page 2 came back: the steps, who carries each and for how many days.
 *
 * Nothing about this trail was remembered by the door — the house, the
 * type (or "custom") and the start toggle all ride back on the Open
 * button's own parameters, and the steps are read out of the form by
 * number. The five refusals are the app's own, checked in trail-rules
 * and again by the database.
 *
 * Every one of those refusals keeps the dialog OPEN, with the sentence at
 * the top of the page and every box as it was left. The founder's vet
 * (2026-09-03) had one arrive as a `notification` toast on the closing
 * dialog: the dialog shut, nothing was said loudly enough to see, and no
 * trail appeared. A page-2 failure is now never a toast — only the
 * confirmation closes this dialog.
 */
async function handleTrailStepsSubmit(event: ChatEvent, actor: Actor, privateTo: string | null) {
  const params = buttonParams(event);
  const mode = params.mode === "custom" ? "custom" : "set";
  const unitId = params.unit ?? "";
  const set = params.set ?? "";
  const count = Number(params.count);
  const start = params.start === "on";
  // Set mode carries the type's activities on the button, because page 2
  // shows them as labels rather than dropdowns — there is nothing in the
  // form to read them back from.
  const activityIds = params.activities ? params.activities.split(",") : undefined;

  // A button whose parameters didn't survive is not something to guess
  // at: nothing is written, and the person is told privately.
  if (!unitId || !set || !Number.isInteger(count) || count < 1) {
    return closeDialog(SOMETHING_WENT_WRONG, privateTo);
  }

  const values: Record<string, string | null> = { title: formValue(event, "title") };
  for (let step = 1; step <= count; step += 1) {
    values[`activity_${step}`] = formValue(event, `activity_${step}`);
    values[`person_${step}`] = formValue(event, `person_${step}`);
    values[`days_${step}`] = formValue(event, `days_${step}`);
  }

  // Any refusal from here on is shown on this same page, rebuilt around
  // it: the sentence first, then every box as the person left it.
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
      // A trail from a type is titled with the type's name, which
      // openTrail fills in; only a custom trail has a title to carry.
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

  // A custom trail has no earlier trail of its kind to copy department
  // tags from, so the confirmation says where to add them.
  const opened = openedText(actor.firstName, trail);
  return closeDialog(mode === "custom" ? `${opened} ${customDepartmentsNote()}` : opened);
}

// The named claims of a refused token, for the server log — enough to
// say WHY the door stayed shut (wrong audience? unknown key? expired?)
// without ever logging the signature that could replay it.
function tokenSummary(token: string) {
  try {
    const [headerB64, payloadB64] = token.split(".");
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return {
      alg: header.alg,
      kid: header.kid,
      iss: payload.iss,
      aud: payload.aud,
      email: payload.email,
      email_verified: payload.email_verified,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  // Two failure regimes, split on proof. Anything that goes wrong BEFORE
  // the token is proven — missing header, bad signature, the project
  // number unset, the certs unreachable — is a 401: the caller has not
  // shown they are Google, and an unproven caller gets no friendliness.
  // Only a failure AFTER proof earns the polite 200 below, because a
  // thrown error there would surface as a raw Google failure message in
  // the space.
  let claims;
  let token = "";
  try {
    const authorization = request.headers.get("authorization") ?? "";
    token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) return new Response("Unauthorized", { status: 401 });

    claims = verifyChatToken(
      token,
      await getGoogleKeys(),
      chatAudience(),
      chatServiceAgent(),
      Math.floor(Date.now() / 1000),
    );
  } catch (error) {
    console.error("google-chat verification failed", error);
    return new Response("Unauthorized", { status: 401 });
  }
  if (!claims) {
    console.error("google-chat token refused", tokenSummary(token));
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // Only now, with Google proven, is the body read at all.
    const event = (await request.json().catch(() => null)) as ChatEvent | null;
    if (!event) return card("I couldn't read that message. Please try again.");

    // Optional belt-and-braces: when set, only listed spaces get answers.
    // Unset means any space in the Workspace — the Chat app itself is
    // already private to the Goodearth Workspace.
    const chat = event.chat ?? {};
    const allowedSpaces = (process.env.GOOGLE_CHAT_ALLOWED_SPACES ?? "")
      .split(",")
      .map((space) => space.trim())
      .filter(Boolean);
    const spaceId = spaceName(event);

    // One line per event for the Vercel log: which kind arrived, from
    // which space, which command id if any, and which of the six
    // identity decisions was reached — never the message text, and
    // never the email. This is how "did Google dispatch the slash
    // command, and did it know who sent it?" gets answered without
    // guessing from what appears in chat.
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
          // Which step of a dialog this is, if any: the one fact that
          // says whether "Opens a dialog" is ticked in Google's console.
          dialog: dialogEventType(event),
          sender,
        }),
      );

    if (allowedSpaces.length > 0 && !allowedSpaces.includes(spaceId)) {
      logEvent(null);
      return card("This space isn't set up for Relay yet.");
    }

    // Only a person's message, command or button press needs a person
    // behind it. Joining and leaving a space are the space's business,
    // not anybody's, so they never cost a lookup.
    const identity =
      chat.messagePayload || chat.appCommandPayload || chat.buttonClickedPayload
        ? await resolveIdentity(event)
        : null;
    logEvent(identity?.kind ?? null);

    if (chat.addedToSpacePayload) return await handleJoin(event, spaceId);

    if (identity) {
      // Anyone the toolbox can't act for is told so privately, in one
      // of the five fixed sentences — never anything that says more
      // about who does or doesn't have an account. Inside a dialog the
      // refusal has to shut the dialog too, or it sits there open with
      // nothing happening.
      const privateTo = senderName(event);
      if (identity.kind !== "ok") {
        const refusal = identityRefusal(identity.kind);
        // A dialog request must be answered with a dialog, so the
        // refusal becomes one; a dialog already open is shut instead.
        if (dialogEventType(event) === "REQUEST_DIALOG") return pushCard(noticeDialog(refusal));
        return chat.buttonClickedPayload
          ? closeDialog(refusal, privateTo)
          : card(refusal, privateTo);
      }

      // Who the door acts as, from here on. The email is the one Google
      // vouched for and identity.ts matched an account to; act-as.ts
      // checks the account it mints for is this same id before letting
      // anything be written.
      const actor: Actor = {
        userId: identity.userId,
        email: identity.email,
        firstName: identity.firstName,
      };

      // A card button — a row's Push/Finish/Bounce/client button, or a
      // dialog's Save. Which of the four it is comes from the dialog
      // step Google put on the event, and every one of them names its
      // own action in the button's parameters.
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
          // A Save this door doesn't recognise still has to shut the
          // dialog, or it sits open with nothing happening.
          return closeDialog();
        }
        if (step === "CANCEL_DIALOG") return closeDialog();
        // Bounce is the only button declared OPEN_DIALOG, so this is it.
        if (step === "REQUEST_DIALOG") return await handleBounceDialog(event);
        return await handleButtonPress(event, actor, privateTo);
      }

      // A typed slash command arrives as an appCommandPayload; Google's
      // older shape tags the message itself instead. Answer both the same.
      const id = commandId(event);
      if (chat.appCommandPayload || id !== null) {
        const command = (id !== null && COMMANDS[id]) || "that command";
        if (id === LINK_COMMAND_ID) return await handleLinkCommand(event, spaceId, privateTo);

        // /push, /bounce and /finish are the court card too: the same
        // question ("which of these do you mean?"), answered by the
        // buttons on its rows.
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

        // Anything unrecognised keeps the Phase 3 greeting.
        return card(greeting(identity.firstName, command), privateTo);
      }
      return card(greeting(identity.firstName, null), privateTo);
    }

    // Removal, and any interaction kind this phase doesn't know:
    // acknowledge with an empty envelope so Google has a well-formed
    // answer.
    return Response.json({});
  } catch (error) {
    console.error("google-chat handler failed", error);
    return card(SOMETHING_WENT_WRONG);
  }
}
