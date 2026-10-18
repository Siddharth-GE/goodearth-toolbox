import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inlineDisposition } from "./disposition";

describe("inlineDisposition", () => {
  it("keeps a plain name as it is", () => {
    assert.equal(
      inlineDisposition("plan.pdf"),
      `inline; filename="plan.pdf"; filename*=UTF-8''plan.pdf`,
    );
  });

  it("swaps non-ASCII for _ in the fallback, drops quotes, and encodes the real name", () => {
    assert.equal(
      inlineDisposition('Café "A".pdf'),
      `inline; filename="Caf_ A.pdf"; filename*=UTF-8''Caf%C3%A9%20%22A%22.pdf`,
    );
  });
});
