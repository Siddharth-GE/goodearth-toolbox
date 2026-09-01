/**
 * The door's lock, tested with keys minted in-process — no network, no
 * Google. These pin what the verifier must refuse: the wrong audience,
 * the wrong issuer, the wrong sender identity, a dead expiry, an unknown
 * key, a bent signature, a smuggled algorithm, and things that aren't
 * tokens at all.
 *
 * The identity checks matter most: an accounts.google.com ID token with
 * the right audience can be minted by ANY Google service account, so the
 * email claim — the project's own Chat service agent — is what makes
 * this our lock and not just "a Google lock".
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createSign, generateKeyPairSync } from "node:crypto";

import { CHAT_ISSUER, keyFromPem, verifyChatToken } from "./verify";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const stranger = generateKeyPairSync("rsa", { modulusLength: 2048 });

const AUDIENCE = "https://staging.example.org/api/google-chat";
const SERVICE_AGENT = "service-123456789012@gcp-sa-gsuiteaddons.iam.gserviceaccount.com";
const NOW = 1_756_600_000; // seconds — an arbitrary fixed clock
const KEYS = new Map([["kid-1", publicKey]]);

function mintToken({
  header = { alg: "RS256", kid: "kid-1", typ: "JWT" } as Record<string, unknown>,
  claims = {} as Record<string, unknown>,
  signer = privateKey,
} = {}) {
  const payload = {
    iss: CHAT_ISSUER,
    aud: AUDIENCE,
    email: SERVICE_AGENT,
    email_verified: true,
    exp: NOW + 3600,
    ...claims,
  };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createSign("RSA-SHA256")
    .update(`${headerB64}.${payloadB64}`)
    .sign(signer, "base64url");
  return `${headerB64}.${payloadB64}.${signature}`;
}

function check(token: string) {
  return verifyChatToken(token, KEYS, AUDIENCE, SERVICE_AGENT, NOW);
}

test("a genuine token passes and hands back its claims", () => {
  const claims = check(mintToken());
  assert.ok(claims);
  assert.equal(claims.iss, CHAT_ISSUER);
  assert.equal(claims.aud, AUDIENCE);
  assert.equal(claims.email, SERVICE_AGENT);
});

test("the wrong audience is refused", () => {
  assert.equal(check(mintToken({ claims: { aud: "https://evil.example.org/hook" } })), null);
});

test("the wrong issuer is refused even with a valid signature", () => {
  assert.equal(
    check(mintToken({ claims: { iss: "https://accounts.google.com.evil.test" } })),
    null,
  );
});

test("another service account's token is refused — Google-signed is not enough", () => {
  // A perfectly genuine ID token, right audience, but minted by someone
  // else's service account. This is the attack the email check exists for.
  const impostor = mintToken({
    claims: { email: "attacker-sa@some-other-project.iam.gserviceaccount.com" },
  });
  assert.equal(check(impostor), null);

  const missingEmail = mintToken({ claims: { email: undefined } });
  assert.equal(check(missingEmail), null);
});

test("an unverified email claim is refused", () => {
  assert.equal(check(mintToken({ claims: { email_verified: false } })), null);
  assert.equal(check(mintToken({ claims: { email_verified: undefined } })), null);
});

test("an expired token is refused, and exp is not optional", () => {
  assert.equal(check(mintToken({ claims: { exp: NOW - 1 } })), null);
  assert.equal(check(mintToken({ claims: { exp: undefined } })), null);
});

test("a kid we don't hold a key for is refused", () => {
  assert.equal(check(mintToken({ header: { alg: "RS256", kid: "kid-unknown" } })), null);
});

test("a mangled signature is refused", () => {
  const token = mintToken();
  const bent = token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.equal(check(bent), null);
});

test("a token signed by someone else's key is refused", () => {
  assert.equal(check(mintToken({ signer: stranger.privateKey })), null);
});

test("only RS256 is accepted — alg cannot be talked down", () => {
  assert.equal(check(mintToken({ header: { alg: "none", kid: "kid-1" } })), null);
  assert.equal(check(mintToken({ header: { alg: "HS256", kid: "kid-1" } })), null);
});

test("things that aren't JWTs are refused, not thrown on", () => {
  for (const junk of ["", "garbage", "a.b", "a.b.c.d", "not.base64.!!!", "🙂.🙂.🙂"]) {
    assert.equal(check(junk), null);
  }
});

test("keyFromPem accepts a bare public key PEM", () => {
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const key = keyFromPem(pem);
  const claims = verifyChatToken(
    mintToken(),
    new Map([["kid-1", key]]),
    AUDIENCE,
    SERVICE_AGENT,
    NOW,
  );
  assert.ok(claims);
});
