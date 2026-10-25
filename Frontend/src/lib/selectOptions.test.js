import test from "node:test";
import assert from "node:assert/strict";
import { selectNumericId, toSelectItems } from "./selectOptions.js";

test("numeric and string option IDs retain descriptive labels with string Select values", () => {
  assert.deepEqual(toSelectItems([
    { value: 22, label: "Driver Name — driver@email.com" },
    { value: "category-a", label: "Furniture" },
  ]), [
    { value: "22", label: "Driver Name — driver@email.com" },
    { value: "category-a", label: "Furniture" },
  ]);
});

test("driver selection keeps the name label while API submission uses the original numeric ID", () => {
  const driverItems = toSelectItems([{ value: 22, label: "Driver Name — driver@email.com" }]);
  const selectedValue = driverItems[0].value;
  assert.equal(selectedValue, "22");
  assert.equal(driverItems.find((item) => item.value === selectedValue).label, "Driver Name — driver@email.com");
  assert.equal(selectNumericId(selectedValue), 22);
});

test("edit values and asynchronously loaded options resolve through the same normalized mapping", () => {
  const editedCategoryId = 7;
  const beforeLoad = toSelectItems([]);
  const afterLoad = toSelectItems([{ value: "7", label: "Home goods" }]);
  assert.equal(beforeLoad.some((item) => item.value === String(editedCategoryId)), false);
  assert.deepEqual(afterLoad.find((item) => item.value === String(editedCategoryId)), { value: "7", label: "Home goods" });
});

test("invalid Select IDs are not converted into API identifiers", () => {
  assert.equal(selectNumericId("not-an-id"), null);
  assert.equal(selectNumericId("0"), null);
});
