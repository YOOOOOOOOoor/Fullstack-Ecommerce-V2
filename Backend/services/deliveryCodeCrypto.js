import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const key = () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET must be configured before delivery codes can be encrypted.");
  return createHash("sha256").update(process.env.JWT_SECRET).digest();
};

export const encryptDeliveryCode = (code) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
};

export const decryptDeliveryCode = (value) => {
  if (!value) return null;
  const [iv, tag, ciphertext] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};
