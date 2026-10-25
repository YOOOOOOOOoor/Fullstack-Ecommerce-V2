export const MAX_REFUND_EVIDENCE_FILES = 3;
export const MAX_REFUND_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const REFUND_EVIDENCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const fileKey = (file) => `${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${file.type}`;

export function addRefundEvidenceFiles(existing, selected) {
  const next = [...existing];
  const existingKeys = new Set(existing.map(({ file }) => fileKey(file)));
  const errors = [];
  for (const file of selected) {
    if (!REFUND_EVIDENCE_TYPES.has(file.type)) {
      errors.push(`${file.name}: choose a JPEG, PNG, or WebP image.`);
      continue;
    }
    if (file.size > MAX_REFUND_EVIDENCE_BYTES) {
      errors.push(`${file.name}: image must be 5 MB or smaller.`);
      continue;
    }
    const key = fileKey(file);
    if (existingKeys.has(key)) continue;
    if (next.length >= MAX_REFUND_EVIDENCE_FILES) {
      errors.push(`You can attach up to ${MAX_REFUND_EVIDENCE_FILES} images.`);
      break;
    }
    existingKeys.add(key);
    next.push({ file, previewUrl: null });
  }
  return { files: next, errors };
}
