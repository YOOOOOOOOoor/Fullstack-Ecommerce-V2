import assert from "node:assert/strict";
import test from "node:test";
import { canonicalVisitorPage, createVisitorPathTracker, getOrCreateVisitorId } from "./visitorTracking.js";

test("only public allowlisted paths become canonical page keys", () => {
  assert.equal(canonicalVisitorPage("/"), "home");
  assert.equal(canonicalVisitorPage("/products/42"), "product_detail");
  assert.equal(canonicalVisitorPage("/products/42/"), "product_detail");
  for (const path of ["/checkout", "/success", "/admin/analytics", "/driver/dashboard", "/login", "/settings", "/products/42/reviews"]) {
    assert.equal(canonicalVisitorPage(path), null);
  }
});

test("visitor id is persisted and invalid stored values are replaced", () => {
  let value = "not-a-uuid";
  const storage = { getItem: () => value, setItem: (_key, next) => { value = next; } };
  const id = "3b241101-e2bb-4255-8caf-4136c566a962";
  assert.equal(getOrCreateVisitorId(storage, { randomUUID: () => id }), id);
  assert.equal(value, id);
});

test("path tracker ignores query/hash by using pathname and suppresses duplicate path events", () => {
  const events = [];
  const track = createVisitorPathTracker({ getVisitorId: () => "3b241101-e2bb-4255-8caf-4136c566a962", send: (event) => events.push(event) });
  track("/products");
  track("/products");
  track("/products/42");
  track("/checkout");
  assert.deepEqual(events.map(({ pageKey }) => pageKey), ["products", "product_detail"]);
});
