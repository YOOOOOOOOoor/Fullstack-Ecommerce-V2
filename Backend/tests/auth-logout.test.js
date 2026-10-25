import test from "node:test";
import assert from "node:assert/strict";
import { logout } from "../controllers/authControllers.js";

test("logout clears the HTTP-only auth cookie and returns a success response", () => {
  const cleared = [];
  const res = {
    statusCode: 200,
    body: null,
    clearCookie(name, options) { cleared.push({ name, options }); return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  logout({}, res, assert.fail);
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].name, "token");
  assert.equal(cleared[0].options.httpOnly, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.msg, "User logged out successfully");
});
