/** What the admin reads when Claude cannot answer: a sentence, never a raw error. Pure. */

export const NO_KEY =
  "Turing has no key to reach Claude yet. The founder adds it in Vercel's settings.";

export function claudeFailure(status: number | undefined, type: string | undefined): string {
  if (status === 402 || type === "billing_error") {
    return "Turing's credits have run out. Top up the Anthropic account, then ask again.";
  }
  if (status === 401 || status === 403) {
    return "Turing's key to Claude was refused. The founder checks it in Vercel's settings.";
  }
  if (status === 429) return "Claude is taking too many questions at once. Ask again in a minute.";
  if (status === 529 || type === "overloaded_error") {
    return "Claude is busy right now. Ask again in a minute.";
  }
  if (status === 413) return "That is too much to send in one go. Try a smaller file.";
  if (status === 400) {
    return "Claude could not take that message. Start a new conversation and ask again.";
  }
  return "Turing could not reach Claude. Ask again in a moment.";
}

export const REFUSED =
  "Claude declined to answer that. Ask it differently, or start a new conversation.";
export const CUT_OFF = "The answer ran too long and was cut off. Ask for it in smaller parts.";
export const TOO_MANY_STEPS =
  "Turing took too many steps on this one and stopped. Ask again, more narrowly.";
