/**
 * sessionMinter.mjs — OpenCode session ID generation
 *
 * Reproduces the exact algorithm from the OpenCode client source
 * (packages/schema/src/identifier.ts). The server validates the
 * timestamp-derived prefix, so random hex will get 403.
 *
 * Format: ses_ + 12 hex (timestamp-derived) + 14 base62 (random)
 */

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SESSION_RE = /^ses_[a-f0-9]{12}[A-Za-z0-9]{14}$/;

let lastTs = 0;
let counter = 0;

/**
 * Generate a valid OpenCode session ID.
 * Uses descending timestamp encoding (bitwise NOT of ts*4096 + counter).
 */
export function mintSessionId() {
  const ts = Date.now();
  if (ts !== lastTs) {
    lastTs = ts;
    counter = 0;
  }
  counter++;

  const current = BigInt(ts) * 0x1000n + BigInt(counter);
  const value = ~current;
  const time = Array.from({ length: 6 }, (_, i) =>
    Number((value >> BigInt(40 - 8 * i)) & 0xffn).toString(16).padStart(2, "0")
  ).join("");

  const bytes = new Uint8Array(14);
  for (let i = 0; i < 14; i++) bytes[i] = Math.floor(Math.random() * 256);
  const rand = Array.from(bytes, (b) => B62[b % 62]).join("");

  return `ses_${time}${rand}`;
}

/** Validate a session ID against the OpenCode format. */
export function isValidSessionId(id) {
  return typeof id === "string" && SESSION_RE.test(id);
}
