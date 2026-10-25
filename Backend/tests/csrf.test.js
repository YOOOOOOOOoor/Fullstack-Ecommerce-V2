import test from "node:test";
import assert from "node:assert/strict";
import { isTrustedBrowserWrite } from "../middleware/csrf.js";

const request = ({ method = "POST", origin, token = true, fetchSite } = {}) => ({
  method,
  cookies: token ? { token: "session" } : {},
  headers: { origin, "sec-fetch-site": fetchSite },
});

const origins = ["https://shop.example.test"];

test("cookie-authenticated writes accept only configured browser origins", () => {
  assert.equal(isTrustedBrowserWrite(request({ origin: origins[0] }), origins), true);
  assert.equal(isTrustedBrowserWrite(request({ origin: "https://attacker.example" }), origins), false);
  assert.equal(isTrustedBrowserWrite(request({ origin: "null" }), origins), false);
  assert.equal(isTrustedBrowserWrite(request({}), origins), false);
});

test("safe methods and non-cookie API writes keep their expected behavior", () => {
  assert.equal(isTrustedBrowserWrite(request({ method: "GET" }), origins), true);
  assert.equal(isTrustedBrowserWrite(request({ token: false }), origins), true);
  assert.equal(isTrustedBrowserWrite(request({ token: false, fetchSite: "cross-site" }), origins), false);
});
