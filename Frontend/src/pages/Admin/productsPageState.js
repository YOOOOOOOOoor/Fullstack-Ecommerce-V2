export const PRODUCTS_PAGE_SIZE = 5;
export const PRODUCTS_VIEW_KEY = "admin-products-view";

export const DEFAULT_PRODUCT_FILTERS = Object.freeze({
  search: "",
  category: "all",
  color: "all",
  status: "all",
  minPrice: "",
  price: "all",
  stockStatus: "all",
});

function getBrowserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readPreference(storage, key, allowedValues, fallback) {
  try {
    const value = storage?.getItem(key);
    return allowedValues.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writePreference(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Preference persistence is optional when browser storage is unavailable.
  }
}

export function createProductsPageState(storage = getBrowserStorage()) {
  return {
    filters: { ...DEFAULT_PRODUCT_FILTERS },
    page: 1,
    view: readPreference(storage, PRODUCTS_VIEW_KEY, ["table", "grid"], "grid"),
  };
}

export function productsPageReducer(state, action) {
  switch (action.type) {
    case "filter":
      return { ...state, filters: { ...state.filters, [action.name]: action.value }, page: 1 };
    case "clear-filters":
      return { ...state, filters: { ...DEFAULT_PRODUCT_FILTERS }, page: 1 };
    case "page":
      return { ...state, page: action.page };
    case "view":
      return action.view === state.view ? state : { ...state, view: action.view };
    default:
      return state;
  }
}

export function buildProductsQuery(filters, page) {
  return { ...filters, page, limit: PRODUCTS_PAGE_SIZE };
}

export function hasActiveProductFilters(filters) {
  return Object.entries(DEFAULT_PRODUCT_FILTERS).some(([key, value]) => filters[key] !== value);
}
