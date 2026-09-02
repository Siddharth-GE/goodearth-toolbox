import {
  COMMANDS,
  commandId,
  dialogEventType,
  formValue,
  isDirectMessage,
  senderName,
  spaceDisplayName,
  spaceName,
  type ChatEvent,
} from "@/lib/google-chat/events";
import {
  dialogNotEnabled,
  dmCannotLink,
  greeting,
  identityRefusal,
  joinHello,
  linkConfirmation,
  linkDialog,
  linkSaveFailed,
} from "@/lib/google-chat/cards";
import { resolveIdentity } from "@/lib/google-chat/identity";
import {
  linkTargetRows,
  matchSpaceName,
  parseLinkValue,
  projectLabel,
  unitLabel,
  NO_LINK_VALUE,
} from "@/lib/google-chat/space-match";
import { getSpaceLink, linkSpace, listLinkTargets, unlinkSpace } from "@/lib/google-chat/spaces";
import {
  chatAudience,
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
 * joins, and /link opens a dialog to set or change that. Nothing reads
 * the link yet — scoping the other commands is Phase 5.
 */

/**
 * An add-on-style synchronous reply: the message rides inside an action
 * envelope, not as bare `{ text }` — Google shows "Relay not responding"
 * if the envelope is missing, even on a 200.
 *
 * Given a sender's `users/<id>` name, the reply is private to them.
 * Everything that is about one person — a refusal, a greeting, later a
 * lookup — goes back privately; only what the whole space should see
 * (the hello on joining, later the action confirmations) goes public.
 */
function card(text: string, privateTo?: string | null) {
  const message: { text: string; privateMessageViewer?: { name: string } } = { text };
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
 * Shut the dialog, optionally posting a message as it goes — the public
 * confirmation rides along on the close, because Google gives the app
 * one answer and one only. Without a viewer the message is public
 * (the confirmation the whole space should see); with one it is private
 * (a refusal or an apology, which is nobody else's business).
 */
function closeDialog(text?: string, privateTo?: string | null) {
  const body: Record<string, unknown> = {
    action: { navigations: [{ endNavigation: { action: "CLOSE_DIALOG" } }] },
  };
  if (text) {
    const message: { text: string; privateMessageViewer?: { name: string } } = { text };
    if (privateTo) message.privateMessageViewer = { name: privateTo };
    body.hostAppDataAction = { chatDataAction: { createMessageAction: { message } } };
  }
  return Response.json(body);
}

// The one sentence the door falls back on when something on our side
// broke. It is said in two places — the outer catch, and the dialog
// that can't be built without its list — so it is written once.
const SOMETHING_WENT_WRONG = "Something went wrong on our side. Please try again in a moment.";

// /link, as declared in the Chat app's configuration (events.ts holds
// the whole id list). Named here so the dispatch reads as a command
// rather than a number.
const LINK_COMMAND_ID = 7;

// The hello a DM gets on joining: there is nothing to link there, so it
// stays the plain Phase 1 greeting.
const DM_HELLO =
  "Hello! I'm the Relay bot. I can't do anything just yet — " +
  "slash commands for trails are on their way.";

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
  if (isDirectMessage(event)) return card(dmCannotLink(), privateTo);
  if (dialogEventType(event) !== "REQUEST_DIALOG") return card(dialogNotEnabled(), privateTo);

  const targets = await listLinkTargets();
  if (!targets) return card(SOMETHING_WENT_WRONG, privateTo);

  const current = await getSpaceLink(spaceId);
  const selected = current
    ? current.unitId
      ? `unit:${current.unitId}`
      : `project:${current.projectId}`
    : NO_LINK_VALUE;

  return pushCard(linkDialog(linkTargetRows(targets.projects, targets.units), selected));
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
        return chat.buttonClickedPayload
          ? closeDialog(refusal, privateTo)
          : card(refusal, privateTo);
      }

      // A card button. For now the only one is the /link dialog's Save;
      // the trail buttons arrive in Phase 6.
      if (chat.buttonClickedPayload) {
        const step = dialogEventType(event);
        if (step === "SUBMIT_DIALOG") {
          return await handleLinkSubmit(event, spaceId, identity.userId, privateTo);
        }
        if (step === "CANCEL_DIALOG") return closeDialog();
        return Response.json({});
      }

      // A typed slash command arrives as an appCommandPayload; Google's
      // older shape tags the message itself instead. Answer both the same.
      const id = commandId(event);
      if (chat.appCommandPayload || id !== null) {
        const command = (id !== null && COMMANDS[id]) || "that command";
        // /link is the one command this phase actually runs; the rest
        // still get the Phase 3 greeting until Phase 5 scopes them.
        if (id === LINK_COMMAND_ID) return await handleLinkCommand(event, spaceId, privateTo);
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
