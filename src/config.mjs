/**
 * config.mjs — Central configuration for sesmint
 * All values overridable via environment variables.
 */

function int(key, fallback) {
  const v = parseInt(process.env[key], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function float(key, fallback) {
  const v = parseFloat(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function bool(key, fallback) {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1" || v === "yes";
}

function list(key, fallback) {
  const v = process.env[key];
  if (!v) return fallback;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export const config = {
  // Server
  port: int("SESMINT_PORT", 8800),
  host: process.env.SESMINT_HOST || "0.0.0.0",

  // Upstream (9router or any OpenAI-compatible gateway)
  upstream: process.env.SESMINT_UPSTREAM || "http://127.0.0.1:20128",

  // Concurrency
  maxConcurrent: int("SESMINT_MAX_CONCURRENT", 40),
  queueTimeout: int("SESMINT_QUEUE_TIMEOUT", 30000),

  // Which model prefixes get session rotation
  rotatePrefixes: list("SESMINT_ROTATE_MODELS", ["opencode/"]),

  // Anti-detection
  uaRotation: bool("SESMINT_UA_ROTATION", true),
  clientRotation: bool("SESMINT_CLIENT_ROTATION", true),
  requestJitterMs: int("SESMINT_JITTER_MS", 150),
  maxRetries: int("SESMINT_MAX_RETRIES", 3),
  retryBaseDelayMs: int("SESMINT_RETRY_DELAY", 500),

  // Logging
  verbose: bool("SESMINT_VERBOSE", false),
};
