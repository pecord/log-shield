import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

let _derivedKey: Buffer | null = null;

function getDerivedKey(): Buffer {
  if (_derivedKey) return _derivedKey;

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET env var is required for encryption");
  }

  const salt = Buffer.from("logshield-user-settings-v1", "utf-8");
  const info = Buffer.from("user-settings-encryption", "utf-8");

  _derivedKey = Buffer.from(
    crypto.hkdfSync("sha256", secret, salt, info, KEY_LENGTH)
  );
  return _derivedKey;
}

export function encrypt(plaintext: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

export function decrypt(ciphertext: string): string {
  const key = getDerivedKey();
  const combined = Buffer.from(ciphertext, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(combined.length - TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);

  return decipher.update(encrypted).toString("utf-8") + decipher.final("utf-8");
}

export function maskApiKey(key: string): string {
  if (key.length <= 6) return "****";
  return `${key.slice(0, 3)}...${key.slice(-3)}`;
}

/** Reset cached key (for testing only) */
export function _resetKeyCache(): void {
  _derivedKey = null;
}
