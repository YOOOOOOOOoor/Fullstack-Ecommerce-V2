import test from "node:test";
import assert from "node:assert/strict";
import { decryptDeliveryCode, encryptDeliveryCode } from "../services/deliveryCodeCrypto.js";

test("delivery codes are stored as authenticated ciphertext and decrypt only with the configured key", () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-only-secret-that-is-long-enough-for-encryption";
  try {
    const code = "004281";
    const ciphertext = encryptDeliveryCode(code);
    assert.notEqual(ciphertext, code);
    assert.equal(decryptDeliveryCode(ciphertext), code);
    assert.notEqual(encryptDeliveryCode(code), ciphertext);
    assert.throws(() => decryptDeliveryCode(`${ciphertext.slice(0, -1)}x`));
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
