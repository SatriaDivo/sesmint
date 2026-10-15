/**
 * stats.mjs — Usage tracking and metrics
 */

export class Stats {
  constructor() {
    this.totalRequests = 0;
    this.totalRotated = 0;
    this.totalRetries = 0;
    this.totalErrors = 0;
    this.byStatus = {};
    this.byModel = {};
    this.startedAt = Date.now();
  }

  record(status, model, rotated = false, retried = false) {
    this.totalRequests++;
    if (rotated) this.totalRotated++;
    if (retried) this.totalRetries++;
    if (status >= 400) this.totalErrors++;

    this.byStatus[status] = (this.byStatus[status] || 0) + 1;
    if (model) {
      this.byModel[model] = (this.byModel[model] || 0) + 1;
    }
  }

  snapshot() {
    const uptime = Math.floor((Date.now() - this.startedAt) / 1000);
    return {
      uptimeSeconds: uptime,
      totalRequests: this.totalRequests,
      totalRotated: this.totalRotated,
      totalRetries: this.totalRetries,
      totalErrors: this.totalErrors,
      byStatus: this.byStatus,
      byModel: this.byModel,
    };
  }
}
