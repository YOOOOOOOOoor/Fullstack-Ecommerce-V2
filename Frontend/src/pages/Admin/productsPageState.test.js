import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProductsQuery,
  createProductsPageState,
  hasActiveProductFilters,
  PRODUCTS_VIEW_KEY,
  productsPageReducer,
  readPreference,
  writePreference,
} from "./productsPageState.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("view defaults to grid and persists the selected preference", () => {
  const storage = memoryStorage();
  const initial = createProductsPageState(storage);
  assert.equal(initial.view, "grid");
  const table = productsPageReducer(initial, { type: "view", view: "table" });
  writePreference(storage, PRODUCTS_VIEW_KEY, table.view);
  const restored = createProductsPageState(storage);
  assert.equal(restored.view, "table");
});

test("invalid or unavailable stored preferences fall back safely", () => {
  const storage = memoryStorage({ [PRODUCTS_VIEW_KEY]: "list" });
  const state = createProductsPageState(storage);
  assert.equal(state.view, "grid");
  assert.equal(readPreference({ getItem() { throw new Error("storage disabled"); } }, PRODUCTS_VIEW_KEY, ["table", "grid"], "grid"), "grid");
});

test("switching views preserves filters, page, and query for both presentations", () => {
  let state = createProductsPageState(memoryStorage());
  state = productsPageReducer(state, { type: "filter", name: "category", value: "4" });
  state = productsPageReducer(state, { type: "filter", name: "minPrice", value: "100" });
  state = productsPageReducer(state, { type: "page", page: 3 });
  const before = buildProductsQuery(state.filters, state.page);
  state = productsPageReducer(state, { type: "view", view: "grid" });
  assert.equal(state.page, 3);
  assert.deepEqual(buildProductsQuery(state.filters, state.page), before);
  assert.deepEqual(before, { search: "", category: "4", color: "all", status: "all", minPrice: "100", price: "all", stockStatus: "all", page: 3, limit: 5 });
});

test("filtering resets pagination and clear filters restores the unfiltered query", () => {
  let state = createProductsPageState(memoryStorage());
  state = productsPageReducer(state, { type: "page", page: 4 });
  state = productsPageReducer(state, { type: "filter", name: "search", value: "lamp" });
  assert.equal(state.page, 1);
  assert.equal(hasActiveProductFilters(state.filters), true);
  state = productsPageReducer(state, { type: "clear-filters" });
  assert.equal(hasActiveProductFilters(state.filters), false);
});

