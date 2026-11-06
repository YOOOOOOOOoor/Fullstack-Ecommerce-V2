/** Format a category name for display without changing its stored/API value. */
export function formatCategoryName(value) {
  if (typeof value !== "string") return "";

  const characters = Array.from(value.trim().toLowerCase());
  if (characters.length === 0) return "";

  characters[0] = characters[0].toUpperCase();
  return characters.join("");
}
