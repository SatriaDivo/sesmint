/**
 * proxy.mjs — Core HTTP proxy with session rotation, retry, and anti-detection
 */

import http from "node:http";
import { URL } from "node:url";
import { config } from "./config.mjs";
import { mintSessionId } from "./sessionMinter.mjs";
import { applyFingerprint } from "./fingerprint.mjs";
import { Throttle } from "./throttle.mjs";
import { Stats } from "./stats.mjs";

const upstreamUrl = new URL(config.upstream);
const UPSTREAM_HOST = upstreamUrl.hostname;
const UPSTREAM_PORT = parseInt(upstreamUrl.port || "80", 10);

const throttle = new Throttle(config.maxConcurrent, config.requestJitterMs);
const stats = new Stats();

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  if (!config.verbose) return;
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function shouldRotate(bodyBuf) {
  if (config.rotatePrefixes.length === 0) return false;
  try {
    const body = JSON.parse(bodyBuf.toString("utf8"));
    const model = body.model || "";
    return config.rotatePrefixes.some((p) => model.startsWith(p));
  } catch {
    return false;
  }
}

function extractModel(bodyBuf) {
  try {
    return JSON.parse(bodyBuf.toString("utf8")).model || "unknown";
  } catch {
    return "unknown";
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Upstream request with retry ────────────────────────────────────────────

/**
 * Forward a request upstream. On 403/429, mint a new session and retry
 * with exponential backoff. Streams the successful response back.
 */
function forwardWithRetry(req, res, bodyBuf, rotate, attempt = 0) {
  const sessionId = rotate ? mintSessionId() : null;

  // Build headers
  const headers = { ...req.headers };
  delete headers["host"];
  delete headers["connection"];
  delete headers["transfer-encoding"];
  delete headers["content-length"];

  if (sessionId) {
    headers["x-opencode-session"] = sessionId;
    headers["x-opencode-session-id"] = sessionId;
    headers["x-session-affinity"] = sessionId;
    headers["x-session-id"] = sessionId;
  }

  if (rotate) {
    applyFingerprint(headers, req.headers);
  }

  if (bodyBuf.length > 0) {
    headers["content-length"] = Buffer.byteLength(bodyBuf);
  }

  const upstreamPath = req.url.startsWith("/") ? req.url : `/${req.url}`;

  const upstreamReq = http.request(
    {
      hostname: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      path: upstreamPath,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      const status = upstreamRes.statusCode;

      // Retry on rate-limit / free-tier errors
      if ((status === 403 || status === 429) && rotate && attempt < config.maxRetries) {
        // Drain the error response
        upstreamRes.resume();
        const delay = config.retryBaseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        log(`retry ${status} attempt=${attempt + 1} delay=${delay}ms ses=${sessionId?.slice(0, 16)}`);
        stats.record(status, extractModel(bodyBuf), true, true);
        sleep(delay).then(() => {
          forwardWithRetry(req, res, bodyBuf, rotate, attempt + 1);
        });
        return;
      }

      // Success or non-retryable — stream back
      const resHeaders = { ...upstreamRes.headers };
      delete resHeaders["transfer-encoding"];
      res.writeHead(status, resHeaders);
      upstreamRes.pipe(res);

      upstreamRes.on("end", () => {
        stats.record(status, extractModel(bodyBuf), !!sessionId, attempt > 0);
        log(`${req.method} ${upstreamPath} → ${status} ses=${sessionId?.slice(0, 16) || "none"} attempt=${attempt}`);
      });

      upstreamRes.on("error", () => {
        if (!res.writableEnded) res.end();
      });
    }
  );

  upstreamReq.on("error", (e) => {
    log(`upstream error: ${e.message}`);
    stats.record(502, extractModel(bodyBuf), !!sessionId, attempt > 0);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: `Upstream: ${e.message}` } }));
    } else {
      res.end();
    }
  });

  if (bodyBuf.length > 0) upstreamReq.write(bodyBuf);
  upstreamReq.end();
}

// ── Server ─────────────────────────────────────────────────────────────────

export function createServer() {
  return http.createServer(async (req, res) => {
    // Health
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", ...throttle.stats }));
      return;
    }

    // Stats
    if (req.url === "/stats") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ...stats.snapshot(), throttle: throttle.stats }));
      return;
    }

    // Collect body
    let bodyBuf;
    try {
      bodyBuf = await collectBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Bad request body" } }));
      return;
    }

    const rotate = shouldRotate(bodyBuf);

    // Acquire concurrency slot
    try {
      await throttle.acquire();
    } catch {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Queue full, try again" } }));
      return;
    }

    // Jitter to smooth burst patterns
    await throttle.jitter();

    // Forward (release on completion)
    const origEnd = res.end.bind(res);
    res.end = (...args) => {
      throttle.release();
      origEnd(...args);
    };

    forwardWithRetry(req, res, bodyBuf, rotate);
  });
}
