import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCronAuthorized } from "./keep-alive";

describe("isCronAuthorized", () => {
  it("accepts the exact bearer secret", () => {
    assert.equal(isCronAuthorized("Bearer s3cret", "s3cret"), true);
  });
  it("refuses when no secret is configured, even if the header matches nothing", () => {
    assert.equal(isCronAuthorized("Bearer s3cret", undefined), false);
    assert.equal(isCronAuthorized("Bearer ", ""), false);
  });
  it("refuses a missing or malformed header", () => {
    assert.equal(isCronAuthorized(null, "s3cret"), false);
    assert.equal(isCronAuthorized("", "s3cret"), false);
    assert.equal(isCronAuthorized("s3cret", "s3cret"), false);
    assert.equal(isCronAuthorized("Basic s3cret", "s3cret"), false);
  });
  it("refuses a wrong secret, including prefixes and different lengths", () => {
    assert.equal(isCronAuthorized("Bearer s3cre", "s3cret"), false);
    assert.equal(isCronAuthorized("Bearer s3cretx", "s3cret"), false);
    assert.equal(isCronAuthorized("Bearer S3CRET", "s3cret"), false);
  });
});
