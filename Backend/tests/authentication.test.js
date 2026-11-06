import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import pool from "../config/db.js";
import { googleLogin, login, register } from "../controllers/authControllers.js";

process.env.JWT_SECRET ||= "authentication-tests-only-secret";
process.env.GOOGLE_CLIENT_ID ||= "google-client-test-id";

function response() {
  return {
    statusCode: 200,
    body: null,
    cookies: [],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie(...args) { this.cookies.push(args); return this; },
  };
}

const emptyRows = { rows: [] };

test("local registration requires a password and stores a bcrypt hash", async (t) => {
  const queries = [];
  t.mock.method(pool, "query", async (sql, values) => {
    queries.push({ sql, values });
    if (/select \* from users/i.test(sql)) return emptyRows;
    return { rows: [{ id: 41, name: "Local", email: "local@example.com", role: "customer" }] };
  });

  const missingPassword = response();
  await register({ body: { name: "Local", email: "local@example.com" } }, missingPassword);
  assert.equal(missingPassword.statusCode, 400);
  assert.equal(queries.length, 0);

  const res = response();
  await register({ body: { name: "Local", email: "LOCAL@example.com", password: "correct horse" } }, res);
  const insert = queries.find(({ sql }) => /insert into users/i.test(sql));
  assert.ok(insert);
  assert.notEqual(insert.values[2], "correct horse");
  assert.equal(await bcrypt.compare("correct horse", insert.values[2]), true);
  assert.equal(insert.values[5], "local");
  assert.equal(res.statusCode, 201);
});

test("local login works and passwordless accounts fail without reaching bcrypt", async (t) => {
  const hash = await bcrypt.hash("local-password", 4);
  let user = { id: 5, email: "local@example.com", name: "Local", role: "customer", provider: "local", password: hash };
  t.mock.method(pool, "query", async (sql) => {
    if (/select \* from users/i.test(sql)) return { rows: [user] };
    return emptyRows;
  });
  const compare = t.mock.method(bcrypt, "compare", async (password, storedHash) => {
    assert.ok(storedHash);
    return password === "local-password";
  });

  const success = response();
  await login({ body: { email: user.email, password: "local-password" } }, success);
  assert.equal(success.statusCode, 200);
  assert.equal(success.cookies[0][0], "token");
  assert.equal(compare.mock.callCount(), 1);

  user = { ...user, password: null };
  const missingHash = response();
  await login({ body: { email: user.email, password: "anything" } }, missingHash);
  assert.equal(missingHash.statusCode, 400);
  assert.equal(missingHash.body.msg, "Invalid credentials");
  assert.equal(compare.mock.callCount(), 1);

  user = { ...user, provider: "google" };
  const googleAccount = response();
  await login({ body: { email: user.email, password: "anything" } }, googleAccount);
  assert.equal(googleAccount.statusCode, 400);
  assert.match(googleAccount.body.msg, /continue with Google/i);
  assert.equal(compare.mock.callCount(), 1);
});

test("Google login requires a configured client ID before verification or database access", async (t) => {
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  t.after(() => {
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
  });

  let verificationCalls = 0;
  let databaseCalls = 0;
  t.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => {
    verificationCalls += 1;
    throw new Error("Verification must not run without a configured audience");
  });
  t.mock.method(pool, "query", async () => {
    databaseCalls += 1;
    return emptyRows;
  });

  const res = response();
  await googleLogin({ body: { token: "id-token" } }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.msg, "Google authentication is not configured");
  assert.equal(verificationCalls, 0);
  assert.equal(databaseCalls, 0);
});

test("Google verification uses the configured audience and preserves V2 error responses", async (t) => {
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = " expected-google-client-id ";
  t.after(() => {
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
  });

  const optionsSeen = [];
  let databaseCalls = 0;
  t.mock.method(OAuth2Client.prototype, "verifyIdToken", async (options) => {
    optionsSeen.push(options);
    throw new Error("Wrong recipient");
  });
  t.mock.method(pool, "query", async () => {
    databaseCalls += 1;
    return emptyRows;
  });
  t.mock.method(console, "error", () => {});

  const res = response();
  await googleLogin({ body: { token: "token-for-another-client" } }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.msg, "Google authentication failed");
  assert.deepEqual(optionsSeen, [{ idToken: "token-for-another-client", audience: "expected-google-client-id" }]);
  assert.equal(databaseCalls, 0);
});

test("Google login rejects invalid email, unverified email, and missing subject before database lookup", async (t) => {
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = "expected-google-client-id";
  t.after(() => {
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
  });

  let payload = {};
  let databaseCalls = 0;
  t.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => ({ getPayload: () => payload }));
  t.mock.method(pool, "query", async () => {
    databaseCalls += 1;
    return emptyRows;
  });

  for (const invalidPayload of [
    {},
    { email: "not-an-email", email_verified: true, sub: "google-subject" },
    { email: "google@example.com", email_verified: false, sub: "google-subject" },
    { email: "google@example.com", email_verified: true },
    { email: "google@example.com", email_verified: true, sub: "  " },
  ]) {
    payload = invalidPayload;
    const res = response();
    await googleLogin({ body: { token: "id-token" } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.msg, "Google account could not be verified");
  }
  assert.equal(databaseCalls, 0);
});

test("valid Google login creates a passwordless account and preserves V2 response fields", async (t) => {
  t.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => ({
    getPayload: () => ({ email: " Google@Example.com ", email_verified: true, sub: "google-subject-22", name: "Google User", picture: "https://example.com/avatar" }),
  }));
  const queries = [];
  t.mock.method(pool, "query", async (sql, values) => {
    queries.push({ sql, values });
    if (/select \* from users/i.test(sql)) return emptyRows;
    if (/insert into users/i.test(sql)) {
      assert.equal(values[1], "google@example.com");
      assert.equal(values[2], null);
      assert.equal(values[4], "google");
      return { rows: [{ id: 22, name: "Google User", email: "google@example.com", role: "customer" }] };
    }
    return emptyRows;
  });

  const res = response();
  await googleLogin({ body: { token: "verified-id-token" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.msg, "Google login successful");
  assert.equal(res.body.user.id, 22);
  assert.equal(res.body.user.email, "google@example.com");
  assert.deepEqual(res.body.user.permissions, []);
  assert.equal(res.cookies[0][0], "token");
  assert.ok(queries.some(({ sql }) => /insert into users/i.test(sql)));
});

test("Google login reuses existing Google accounts and rejects local account conflicts", async (t) => {
  t.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => ({
    getPayload: () => ({ email: "existing@example.com", email_verified: true, sub: "google-subject-31", name: "Existing" }),
  }));
  let existing = { id: 31, email: "existing@example.com", name: "Existing", provider: "google", role: "customer", password: null };
  let inserts = 0;
  t.mock.method(pool, "query", async (sql) => {
    if (/select \* from users/i.test(sql)) return { rows: [existing] };
    if (/insert into users/i.test(sql)) inserts += 1;
    return emptyRows;
  });

  const reuse = response();
  await googleLogin({ body: { token: "verified-id-token" } }, reuse);
  assert.equal(reuse.statusCode, 200);
  assert.equal(reuse.body.user.id, 31);
  assert.equal(inserts, 0);

  existing = { ...existing, provider: "local", password: "local-hash" };
  const conflict = response();
  await googleLogin({ body: { token: "verified-id-token" } }, conflict);
  assert.equal(conflict.statusCode, 400);
  assert.match(conflict.body.msg, /account already exists/i);
  assert.equal(inserts, 0);
});
