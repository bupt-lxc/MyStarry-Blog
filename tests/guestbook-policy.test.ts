import test from "node:test";
import assert from "node:assert/strict";

test("admin sessions expire and password comparisons do not accept missing secrets", async () => {
  const { isAdminSession, passwordMatches } =
    await import("../src/lib/server/guestbook-policy.ts");
  const now = 1800000000000;
  assert.equal(isAdminSession(undefined, now), false);
  assert.equal(isAdminSession({ loginAt: now - 1800001 }, now), false);
  assert.equal(isAdminSession({ loginAt: now + 1 }, now), false);
  assert.equal(isAdminSession({ loginAt: now }, now), true);
  assert.equal(passwordMatches("secret", "secret"), true);
  assert.equal(passwordMatches("different", "secret"), false);
  assert.equal(passwordMatches("", ""), false);
});

test("trusted origin and source policy reject host, XFF, and forged visitor cookies", async () => {
  const { verifyOrigin, sourceDigest, visitorIdentity } =
    await import("../src/lib/server/guestbook-policy.ts");
  const secret = "test-only-secret-with-at-least-32-characters";
  assert.doesNotThrow(() =>
    verifyOrigin(
      new Request("https://evil.example/api", {
        headers: { origin: "https://portfolio.example" },
      }),
      "https://portfolio.example",
      false,
    ),
  );
  for (const origin of ["https://evil.example", "null", ""])
    assert.throws(() =>
      verifyOrigin(
        new Request("https://evil.example/api", { headers: { origin } }),
        "https://portfolio.example",
        false,
      ),
    );
  assert.throws(() =>
    verifyOrigin(
      new Request("https://evil.example/api", {
        headers: { origin: "https://evil.example" },
      }),
      "",
      false,
    ),
  );
  const a = new Request("https://portfolio.example", {
    headers: {
      "X-Portfolio-Client-IP": "203.0.113.1",
      "X-Forwarded-For": "attacker",
    },
  });
  const b = new Request("https://portfolio.example", {
    headers: {
      "X-Portfolio-Client-IP": "203.0.113.1",
      "X-Forwarded-For": "other",
    },
  });
  assert.equal(
    sourceDigest(a, "", secret, false),
    sourceDigest(b, "", secret, false),
  );
  assert.throws(() =>
    sourceDigest(new Request("https://portfolio.example"), "", secret, false),
  );
  const identity = visitorIdentity(undefined, secret);
  assert.equal(
    visitorIdentity(identity.cookie, secret).digest,
    identity.digest,
  );
  assert.notEqual(
    visitorIdentity(identity.cookie + "forged", secret).digest,
    identity.digest,
  );
  assert.equal(identity.digest.includes("203.0"), false);
});

test("HTTP inputs reject oversized bodies and malformed JSON; auth rejects missing or expired sessions", async () => {
  const { readJson, requireAdmin } =
    await import("../src/lib/server/guestbook-http.ts");
  const request = (body: string) =>
    new Request("https://portfolio.example/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  assert.deepEqual(await readJson(request('{"message":"你好"}')), {
    message: "你好",
  });
  await assert.rejects(
    readJson(request("{malformed")),
    (error: any) => error.status === 400,
  );
  await assert.rejects(
    readJson(request(JSON.stringify({ message: "x".repeat(9000) }))),
    (error: any) => error.status === 413,
  );
  await assert.rejects(
    requireAdmin({ session: undefined }),
    (error: any) => error.status === 401,
  );
  const expired = { get: async () => ({ loginAt: Date.now() - 1800001 }) };
  await assert.rejects(
    requireAdmin({ session: expired as any }),
    (error: any) => error.status === 401,
  );
});
