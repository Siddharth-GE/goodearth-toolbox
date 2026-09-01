/**
 * The door's lock, tested with keys minted in-process — no network, no
 * Google. These pin what the verifier must refuse: the wrong audience,
 * the wrong issuer, a dead expiry, an unknown key, a bent signature, a
 * smuggled algorithm, and things that aren't tokens at all.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createSign, generateKeyPairSync } from "node:crypto";

import { CHAT_ISSUER, keyFromPem, verifyChatToken } from "./verify";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const stranger = generateKeyPairSync("rsa", { modulusLength: 2048 });

const AUDIENCE = "123456789012";
const NOW = 1_756_600_000; // seconds — an arbitrary fixed clock
const KEYS = new Map([["kid-1", publicKey]]);

function mintToken({
  header = { alg: "RS256", kid: "kid-1", typ: "JWT" } as Record<string, unknown>,
  claims = {} as Record<string, unknown>,
  signer = privateKey,
} = {}) {
  const payload = { iss: CHAT_ISSUER, aud: AUDIENCE, exp: NOW + 3600, ...claims };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createSign("RSA-SHA256")
    .update(`${headerB64}.${payloadB64}`)
    .sign(signer, "base64url");
  return `${headerB64}.${payloadB64}.${signature}`;
}

test("a genuine token passes and hands back its claims", () => {
  const claims = verifyChatToken(mintToken(), KEYS, AUDIENCE, NOW);
  assert.ok(claims);
  assert.equal(claims.iss, CHAT_ISSUER);
  assert.equal(claims.aud, AUDIENCE);
});

test("the wrong audience is refused", () => {
  const token = mintToken({ claims: { aud: "999999999999" } });
  assert.equal(verifyChatToken(token, KEYS, AUDIENCE, NOW), null);
});

test("the wrong issuer is refused even with a valid signature", () => {
  const token = mintToken({ claims: { iss: "attacker@system.gserviceaccount.com" } });
  assert.equal(verifyChatToken(token, KEYS, AUDIENCE, NOW), null);
});

test("an expired token is refused, and exp is not optional", () => {
  const expired = mintToken({ claims: { exp: NOW - 1 } });
  assert.equal(verifyChatToken(expired, KEYS, AUDIENCE, NOW), null);

  const missing = mintToken({ claims: { exp: undefined } });
  assert.equal(verifyChatToken(missing, KEYS, AUDIENCE, NOW), null);
});

test("a kid we don't hold a key for is refused", () => {
  const token = mintToken({ header: { alg: "RS256", kid: "kid-unknown" } });
  assert.equal(verifyChatToken(token, KEYS, AUDIENCE, NOW), null);
});

test("a mangled signature is refused", () => {
  const token = mintToken();
  const bent = token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.equal(verifyChatToken(bent, KEYS, AUDIENCE, NOW), null);
});

test("a token signed by someone else's key is refused", () => {
  const token = mintToken({ signer: stranger.privateKey });
  assert.equal(verifyChatToken(token, KEYS, AUDIENCE, NOW), null);
});

test("only RS256 is accepted — alg cannot be talked down", () => {
  const none = mintToken({ header: { alg: "none", kid: "kid-1" } });
  assert.equal(verifyChatToken(none, KEYS, AUDIENCE, NOW), null);

  const hs = mintToken({ header: { alg: "HS256", kid: "kid-1" } });
  assert.equal(verifyChatToken(hs, KEYS, AUDIENCE, NOW), null);
});

test("things that aren't JWTs are refused, not thrown on", () => {
  for (const junk of ["", "garbage", "a.b", "a.b.c.d", "not.base64.!!!", "🙂.🙂.🙂"]) {
    assert.equal(verifyChatToken(junk, KEYS, AUDIENCE, NOW), null);
  }
});

test("keyFromPem accepts a bare public key PEM", () => {
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const key = keyFromPem(pem);
  const claims = verifyChatToken(mintToken(), new Map([["kid-1", key]]), AUDIENCE, NOW);
  assert.ok(claims);
});
