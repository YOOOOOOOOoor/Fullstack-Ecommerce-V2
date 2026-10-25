import assert from "node:assert/strict";
import test from "node:test";
import { chapaInitializationErrorDetails } from "../services/chapaInitializationError.js";

test("Chapa HTTP failures log only the provider status", () => {
  const error = { response: { status: 401, data: { message: "private provider response" } }, config: { headers: { Authorization: "secret" } } };
  assert.deepEqual(chapaInitializationErrorDetails(error), { category: "provider_response", status: 401 });
});

test("Chapa transport failures expose a safe error code without request details", () => {
  const error = { isAxiosError: true, code: "ECONNABORTED", config: { headers: { Authorization: "secret" } } };
  assert.deepEqual(chapaInitializationErrorDetails(error), { category: "provider_transport", code: "ECONNABORTED" });
});

test("database failures are not mislabeled as Chapa outages and raw messages are omitted", () => {
  const error = { code: "42703", message: "secret-bearing diagnostic" };
  assert.deepEqual(chapaInitializationErrorDetails(error), { category: "application", code: "42703" });
  assert.deepEqual(chapaInitializationErrorDetails({ message: "provider request body with secret" }), { category: "application", code: "internal_error" });
});
