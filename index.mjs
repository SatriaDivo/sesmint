#!/usr/bin/env node
/**
 * sesmint — OpenCode Session Minting Proxy
 * Entry point. See README.md for full documentation.
 */

import { createServer } from "./src/proxy.mjs";
import { config } from "./src/config.mjs";

const server = createServer();

server.listen(config.port, config.host, () => {
  console.log(`sesmint listening on ${config.host}:${config.port}`);
  console.log(`  upstream:      ${config.upstream}`);
  console.log(`  maxConcurrent: ${config.maxConcurrent}`);
  console.log(`  rotateModels:  ${config.rotatePrefixes.join(", ")}`);
  console.log(`  uaRotation:    ${config.uaRotation}`);
  console.log(`  jitter:        ${config.requestJitterMs}ms`);
  console.log(`  maxRetries:    ${config.maxRetries}`);
});

server.on("error", (e) => {
  console.error(`server error: ${e.message}`);
  process.exit(1);
});

process.on("SIGINT", () => { console.log("shutting down…"); server.close(() => process.exit(0)); });
process.on("SIGTERM", () => { console.log("shutting down…"); server.close(() => process.exit(0)); });
