/** Client Relations: clients, plots' paperwork and dues, receipts and actions, through its own saves. */
import type { Field } from "../catalogue-fields";
import { defineEntries } from "./define";

// Client Relations' fixed lists, restated for Turing (which may not import them); its saves refuse anything else.
const DEED = "not_started, drafting, not_signed or signed";
const ORIGINAL = "client, bank, chess_cafe, sreejayan or tarana (only for a signed document)";
const ACK = "received, with_bank, with_sreejayan, requested_from_client or pending";
const REGISTRATION = "not_due, due, scheduled or registered";
const BOTTLENECKS = "design, client, payments, management, interiors, legal, bank_loan";
const INTERIOR =
  "to_pitch, pitch_done, retainer_pending, retainer_paid, in_design, execution or closed";
const STATUSES = ["open", "waiting_client", "waiting_management", "awaiting_confirmation", "done"];

const client: Field = {
  key: "client_id",
  label: "Client",
  kind: "id",
  table: "clients",
  record: true,
};
const plot: Field = { key: "plot_id", label: "Plot", kind: "id", table: "plots" };
const person = (key: string, label: string): Field => ({
  key,
  label,
  kind: "id",
  table: "profiles",
  optional: true,
});
const action: Field = {
  key: "action_id",
  label: "Action",
  kind: "id",
  table: "client_actions",
  record: true,
};
const side: Field = {
  key: "side",
  label: "Side",
  kind: "choice",
  choices: ["construction", "interior"],
  optional: true,
};
const date = (key: string, label: string): Field => ({ key, label, kind: "date", optional: true });
const words = (key: string, label: string, max = 500): Field => ({
  key,
  label,
  kind: "text",
  optional: true,
  max,
});

export const CLIENT_RELATIONS = defineEntries([
  {
    key: "crm_client_new",
    tool: "/client-relations",
    title: "A client or prospect",
    description:
      "Adds a person to Client Relations: a prospect (left out), a client, or lost (with the reason). owner_id is who handles them, someone on the Client Relations team; left out, nobody yet. A plot is given with crm_assign_plot.",
    adds: true,
    alike: { table: "clients", phone: "mobile" },
    fields: [
      { key: "name", label: "Name", kind: "text", max: 200 },
      words("mobile", "Mobile", 40),
      words("email", "Email", 200),
      {
        key: "stage",
        label: "Stage",
        kind: "choice",
        choices: ["prospect", "client", "lost"],
        optional: true,
        start: "prospect",
      },
      person("owner_id", "Handled by"),
      words("source", "How they found us", 200),
      date("first_contact_on", "First contact"),
      words("lost_reason", "Why lost"),
      words("notes", "Notes", 4000),
    ],
  },
  {
    key: "crm_client_change",
    tool: "/client-relations",
    title: "A client, changed",
    description:
      "Changes a client's name, mobile, email, stage (prospect, client or lost — lost needs the reason), who handles them, how they found us, first contact or notes. Each left out stays as it is.",
    fields: [
      client,
      { key: "name", label: "Name", kind: "text", optional: true, keep: true, max: 200 },
      words("mobile", "Mobile", 40),
      words("email", "Email", 200),
      {
        key: "stage",
        label: "Stage",
        kind: "choice",
        choices: ["prospect", "client", "lost"],
        optional: true,
        keep: true,
      },
      person("owner_id", "Handled by"),
      words("source", "How they found us", 200),
      date("first_contact_on", "First contact"),
      words("lost_reason", "Why lost"),
      words("notes", "Notes", 4000),
    ],
  },
  {
    key: "crm_assign_plot",
    tool: "/client-relations",
    title: "A plot, given to a client",
    description:
      "Gives a client a plot nobody has yet (its villa in Masters), reserved or sold; a prospect becomes a client. Selling it gives it a Construction owner.",
    fields: [
      client,
      plot,
      {
        key: "status",
        label: "Mark as",
        kind: "choice",
        choices: ["reserved", "sold"],
        optional: true,
        start: "reserved",
      },
    ],
    adds: true,
  },
  {
    key: "crm_plot_change",
    tool: "/client-relations",
    title: "A plot's record, changed",
    description: `Changes a sold plot's record in Client Relations; each field left out stays as it is, one given empty clears it. Owners (construction_owner_id, interior_owner_id) are people on the Client Relations team; a side with open actions can't be left with nobody, and its open actions move to its new owner. Sale deed and construction agreement (ca_): status ${DEED}; original with ${ORIGINAL}; acknowledgement ${ACK}; signed on. Registration: stage ${REGISTRATION}, note, date. bottlenecks: a comma-separated list of ${BOTTLENECKS} (empty clears). progress_stage_id: build progress, from progress_stages. design_confirmed, permit, working_drawing: true marks it done today, false clears it. Interior stage ${INTERIOR}. Plot value and construction value in rupees.`,
    fields: [
      { ...plot, record: true },
      person("construction_owner_id", "Construction owner"),
      person("interior_owner_id", "Interior owner"),
      { ...words("sale_deed_status", "Sale deed", 40), keep: true },
      words("sale_deed_original_with", "Deed original with", 40),
      words("sale_deed_ack", "Deed acknowledgement", 40),
      date("sale_deed_signed_on", "Deed signed on"),
      { ...words("ca_status", "Agreement", 40), keep: true },
      words("ca_original_with", "Agreement original with", 40),
      words("ca_ack", "Agreement acknowledgement", 40),
      date("ca_signed_on", "Agreement signed on"),
      words("bottlenecks", "Bottlenecks", 200),
      { ...words("registration_stage", "Registration", 40), keep: true },
      words("registration_note", "Registration note", 4000),
      date("registration_on", "Registration date"),
      {
        key: "progress_stage_id",
        label: "Build progress",
        kind: "id",
        table: "progress_stages",
        optional: true,
      },
      { key: "design_confirmed", label: "Design confirmed", kind: "yesno", optional: true },
      { key: "permit", label: "Permit", kind: "yesno", optional: true },
      { key: "working_drawing", label: "Working drawing", kind: "yesno", optional: true },
      words("interior_stage", "Interior stage", 40),
      words("interior_note", "Interior note"),
      words("design_support", "Design support", 4000),
      words("details", "Details", 8000),
      date("check_in_on", "Check-in"),
      { key: "plot_value", label: "Plot value ₹", kind: "amount", optional: true },
      { key: "construction_value", label: "Construction value ₹", kind: "amount", optional: true },
    ],
  },
  {
    key: "crm_milestone",
    tool: "/client-relations",
    title: "A payment stage on a plot",
    description:
      "Changes one stage of a plot's payment schedule (client_payment_milestones.id): the amount due, when it is due, the invoice number with the date it was raised, or a note. Each left out stays as it is.",
    fields: [
      {
        key: "milestone_id",
        label: "Stage",
        kind: "id",
        table: "client_payment_milestones",
        record: true,
      },
      { key: "due_amount", label: "Due ₹", kind: "amount", optional: true },
      date("due_on", "Due on"),
      words("invoice_no", "Invoice no.", 100),
      date("invoiced_on", "Invoiced on"),
      words("note", "Note"),
    ],
  },
  {
    key: "crm_receipt",
    tool: "/client-relations",
    title: "Money received for a plot",
    description:
      "Records money a client paid for a plot: the amount, the day it came in (today if left out), how (bank, cheque, upi, cash or other; bank if left out), its reference, and the payment stage it is for (milestone_id of that plot) — left out, it settles the oldest unpaid stages. A receipt is never changed; a wrong one is cancelled.",
    adds: true,
    fields: [
      plot,
      { key: "amount", label: "Amount ₹", kind: "amount" },
      date("received_on", "Received on"),
      {
        key: "mode",
        label: "How",
        kind: "choice",
        choices: ["bank", "cheque", "upi", "cash", "other"],
        optional: true,
        start: "bank",
      },
      words("reference", "Reference", 200),
      {
        key: "milestone_id",
        label: "For stage",
        kind: "id",
        table: "client_payment_milestones",
        optional: true,
      },
      words("note", "Note"),
    ],
  },
  {
    key: "crm_receipt_cancel",
    tool: "/client-relations",
    title: "A receipt, cancelled",
    description:
      "Cancels a receipt entered by mistake, with the reason; it stays listed, struck through, and counts in no due. Only an admin or the tool's team lead.",
    fields: [
      {
        key: "receipt_id",
        label: "Receipt",
        kind: "id",
        table: "client_receipts",
        record: true,
      },
      { key: "reason", label: "Why", kind: "text" },
    ],
  },
  {
    key: "crm_action_new",
    tool: "/client-relations",
    title: "An action",
    description:
      "Adds an action (a promise to a client, with a date): on a plot's Construction or Interior side (Construction if left out) it goes to that side's owner, and a side with no owner refuses it until one is set; with no plot it goes to owner_id, someone on the team. Its date may be left out.",
    adds: true,
    fields: [
      { ...plot, optional: true },
      { key: "action", label: "What", kind: "text", max: 500 },
      person("owner_id", "Owner"),
      date("due_on", "By"),
      { ...side, start: "construction" },
    ],
  },
  {
    key: "crm_action_change",
    tool: "/client-relations",
    title: "An action, changed",
    description: `Changes an action: its words, date, notes, side or plot (it then goes to that side's owner), its owner (only an action with no plot), or its status — ${STATUSES.join(", ")}. Only whoever set it, or an admin, closes it (done) or opens it again; its owner marks it awaiting_confirmation. Each left out stays as it is.`,
    fields: [
      action,
      { key: "action", label: "What", kind: "text", optional: true, keep: true, max: 500 },
      date("due_on", "By"),
      words("notes", "Notes", 4000),
      { ...side, keep: true },
      { ...plot, optional: true },
      { ...person("owner_id", "Owner"), keep: true },
      {
        key: "status",
        label: "Status",
        kind: "choice",
        choices: STATUSES,
        optional: true,
        keep: true,
      },
    ],
  },
  {
    key: "crm_action_delete",
    tool: "/client-relations",
    title: "An action, deleted",
    description:
      "Deletes an action added by mistake, only while nobody has changed it since it was added; otherwise it is cancelled (crm_action_cancel). Its setter or an admin.",
    fields: [action],
  },
  {
    key: "crm_action_cancel",
    tool: "/client-relations",
    title: "An action, cancelled",
    description:
      "Cancels an action for good, with the reason; it is closed as done and stays among the done, struck through. Its setter or an admin.",
    fields: [action, { key: "reason", label: "Why", kind: "text" }],
  },
]);
