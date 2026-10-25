export function toSelectItems(options) {
  return options.map(({ value, label }) => ({ value: String(value), label }));
}

export function selectNumericId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
