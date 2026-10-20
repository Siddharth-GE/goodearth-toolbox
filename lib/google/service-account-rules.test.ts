import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TOKEN_URL,
  assertionClaims,
  parseServiceAccountKey,
  tokenIsFresh,
} from "./service-account-rules";

const GOOD_KEY = JSON.stringify({
  client_email: "relay-outbound@some-project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----\n",
});

const PARSED = {
  clientEmail: "relay-outbound@some-project.iam.gserviceaccount.com",
  privateKey: "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----\n",
  projectId: null,
};

test("parseServiceAccountKey: a good key parses", () => {
  assert.deepEqual(parseServiceAccountKey(GOOD_KEY), PARSED);
});

test("parseServiceAccountKey: the project id comes along when the key has one", () => {
  const key = JSON.stringify({ ...JSON.parse(GOOD_KEY), project_id: "kaadal-toolbox" });
  assert.deepEqual(parseServiceAccountKey(key), { ...PARSED, projectId: "kaadal-toolbox" });
  const blank = JSON.stringify({ ...JSON.parse(GOOD_KEY), project_id: "" });
  assert.deepEqual(parseServiceAccountKey(blank), PARSED);
});

test("parseServiceAccountKey: trims surrounding whitespace before parsing", () => {
  assert.deepEqual(parseServiceAccountKey(`  ${GOOD_KEY}  \n`), PARSED);
});

test("parseServiceAccountKey: undefined, null and blank are all null", () => {
  assert.equal(parseServiceAccountKey(undefined), null);
  assert.equal(parseServiceAccountKey(null), null);
  assert.equal(parseServiceAccountKey(""), null);
  assert.equal(parseServiceAccountKey("   "), null);
});

test("parseServiceAccountKey: non-JSON is null, not a throw", () => {
  assert.equal(parseServiceAccountKey("not json at all"), null);
  assert.equal(parseServiceAccountKey("{not valid json"), null);
});

test("parseServiceAccountKey: JSON that isn't an object is null", () => {
  assert.equal(parseServiceAccountKey("42"), null);
  assert.equal(parseServiceAccountKey("null"), null);
  assert.equal(parseServiceAccountKey('"a string"'), null);
  assert.equal(parseServiceAccountKey("[1,2,3]"), null);
});

test("parseServiceAccountKey: a missing client_email is null", () => {
  assert.equal(
    parseServiceAccountKey(
      JSON.stringify({
        private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
      }),
    ),
    null,
  );
});

test("parseServiceAccountKey: a blank or address-less client_email is null", () => {
  assert.equal(
    parseServiceAccountKey(
      JSON.stringify({
        client_email: "",
        private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
      }),
    ),
    null,
  );
  assert.equal(
    parseServiceAccountKey(
      JSON.stringify({
        client_email: "not-an-address",
        private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
      }),
    ),
    null,
  );
});

test("parseServiceAccountKey: a missing or malformed private_key is null", () => {
  assert.equal(parseServiceAccountKey(JSON.stringify({ client_email: "a@b.test" })), null);
  assert.equal(
    parseServiceAccountKey(JSON.stringify({ client_email: "a@b.test", private_key: "" })),
    null,
  );
  assert.equal(
    parseServiceAccountKey(
      JSON.stringify({ client_email: "a@b.test", private_key: "not a pem key" }),
    ),
    null,
  );
});

test("parseServiceAccountKey: wrong-typed fields are null", () => {
  assert.equal(
    parseServiceAccountKey(JSON.stringify({ client_email: 42, private_key: "-----BEGIN" })),
    null,
  );
  assert.equal(
    parseServiceAccountKey(JSON.stringify({ client_email: "a@b.test", private_key: 123 })),
    null,
  );
});

test("assertionClaims: shape, the asked scope and the one-hour expiry", () => {
  const claims = assertionClaims(
    "relay-outbound@project.iam.gserviceaccount.com",
    "https://www.googleapis.com/auth/chat.bot",
    1000.7,
  );
  assert.deepEqual(claims, {
    iss: "relay-outbound@project.iam.gserviceaccount.com",
    scope: "https://www.googleapis.com/auth/chat.bot",
    aud: TOKEN_URL,
    iat: 1000,
    exp: 4600,
  });
});

test("tokenIsFresh: 59 seconds left is stale, 61 seconds left is fresh", () => {
  const now = 1_000_000;
  assert.equal(tokenIsFresh(now + 59, now), false);
  assert.equal(tokenIsFresh(now + 61, now), true);
});

test("tokenIsFresh: exactly 60 seconds left is stale", () => {
  const now = 1_000_000;
  assert.equal(tokenIsFresh(now + 60, now), false);
});

test("tokenIsFresh: null is always stale", () => {
  assert.equal(tokenIsFresh(null, 1_000_000), false);
});
