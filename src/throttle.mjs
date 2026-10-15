/**
 * throttle.mjs — Concurrency limiter + request jitter
 *
 * Prevents burst detection by capping parallel upstream requests
 * and adding small random delays before forwarding.
 */

export class Throttle {
  constructor(maxConcurrent, jitterMs = 0) {
    this.max = maxConcurrent;
    this.jitterMs = jitterMs;
    this.inFlight = 0;
    this.waiters = [];
    this.totalQueued = 0;
    this.totalPassed = 0;
  }

  /** Acquire a slot. Resolves immediately if under limit, else queues. */
  async acquire() {
    if (this.inFlight < this.max) {
      this.inFlight++;
      this.totalPassed++;
      return;
    }
    this.totalQueued++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("queue timeout")), 30000);
      this.waiters.push(() => {
        clearTimeout(timer);
        this.inFlight++;
        this.totalPassed++;
        resolve();
      });
    });
  }

  /** Release a slot and let the next waiter through. */
  release() {
    this.inFlight--;
    const next = this.waiters.shift();
    if (next) next();
  }

  /** Random delay to smooth request timing. */
  async jitter() {
    if (this.jitterMs <= 0) return;
    const delay = Math.floor(Math.random() * this.jitterMs);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

  get stats() {
    return {
      inFlight: this.inFlight,
      max: this.max,
      queued: this.totalQueued,
      passed: this.totalPassed,
    };
  }
}
