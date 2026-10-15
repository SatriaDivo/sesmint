/**
 * fingerprint.mjs — Anti-detection header rotation
 *
 * Rotates User-Agent, client type, and other headers to mimic
 * real OpenCode CLI traffic patterns. Prevents pattern-based
 * detection when many requests share the same fingerprint.
 */

// Real OpenCode CLI User-Agent strings (captured from actual clients)
const UA_POOL = [
  "opencode/1.19.0 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14",
  "opencode/1.18.31 ai-sdk/provider-utils/4.0.20 runtime/bun/1.3.10",
  "opencode/1.19.1 ai-sdk/provider-utils/4.0.24 runtime/bun/1.3.15",
  "opencode/1.18.30 ai-sdk/provider-utils/4.0.19 runtime/bun/1.3.8",
  "opencode/1.19.2 ai-sdk/provider-utils/4.0.25 runtime/bun/1.3.16",
  "opencode/2.0.29 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14",
];

// Client types seen in real traffic
const CLIENT_POOL = ["cli", "desktop", "cli", "cli", "desktop"];

// Project IDs (real CLI sends "global" mostly, occasionally scoped)
const PROJECT_POOL = ["global", "global", "global", "global"];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Build anti-detection headers for an OpenCode request.
 * Returns only the headers that should be set/overridden.
 */
export function buildFingerprintHeaders() {
  return {
    "User-Agent": pick(UA_POOL),
    "x-opencode-client": pick(CLIENT_POOL),
    "x-opencode-project": pick(PROJECT_POOL),
  };
}

/**
 * Apply fingerprint headers to a header object (mutates in place).
 * Preserves any downstream-supplied values if present.
 */
export function applyFingerprint(headers, downstream) {
  const fp = buildFingerprintHeaders();
  const lower = {};
  for (const [k, v] of Object.entries(downstream || {})) lower[k.toLowerCase()] = v;

  // Only override if downstream didn't supply a real OpenCode UA
  if (!lower["user-agent"] || !lower["user-agent"].includes("opencode/")) {
    headers["User-Agent"] = fp["User-Agent"];
  }
  if (!lower["x-opencode-client"]) {
    headers["x-opencode-client"] = fp["x-opencode-client"];
  }
  if (!lower["x-opencode-project"]) {
    headers["x-opencode-project"] = fp["x-opencode-project"];
  }
}
