import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("@/lib/queue/client", () => ({ getRedisConnection: () => ({}) }));

import { evaluateHealth, type HealthSnapshot } from "../lib/ops/alerts";
import { pgDumpUrl } from "../lib/ops/backup";
import { signBody } from "../lib/ops/contact-webhook";
import { getOpsRecipient } from "../lib/ops/mailer";
import { iceBreakerKeyword } from "../lib/meta/webhook";
import { toCsv } from "../lib/utils/csv";

const healthy: HealthSnapshot = {
  workerHealthy: true,
  workerLastSeenMinutes: 0,
  tokenRefreshErrors: [],
  expiringAccounts: [],
  recentFailedDms: [],
  recentFailedWebhooks: 0,
};

describe("evaluateHealth", () => {
  it("reports nothing when everything works", () => {
    expect(evaluateHealth(healthy)).toEqual([]);
  });

  it("flags a stopped worker", () => {
    const problems = evaluateHealth({ ...healthy, workerHealthy: false, workerLastSeenMinutes: 9 });
    expect(problems.map((p) => p.kind)).toEqual(["worker_down"]);
    expect(problems[0].message).toContain("9 minuti");
  });

  it("ignores the private-reply failures on comments ManyChat already answered", () => {
    const dms = Array.from({ length: 8 }, () => ({
      errorMessage: "PermissionError 100: The comment is invalid for a private reply",
    }));
    expect(evaluateHealth({ ...healthy, recentFailedDms: dms })).toEqual([]);
  });

  it("alerts on a burst of real DM failures", () => {
    const dms = Array.from({ length: 5 }, () => ({ errorMessage: "RateLimitError 368: blocked" }));
    expect(evaluateHealth({ ...healthy, recentFailedDms: dms }).map((p) => p.kind)).toEqual([
      "dm_failures",
    ]);
  });

  it("alerts on a single revoked token, without waiting for a burst", () => {
    const problems = evaluateHealth({
      ...healthy,
      recentFailedDms: [{ errorMessage: "TokenExpiredError 190: Error validating access token" }],
    });
    expect(problems.map((p) => p.kind)).toEqual(["instagram_auth"]);
  });

  it("flags failed refreshes and tokens about to expire", () => {
    const problems = evaluateHealth({
      ...healthy,
      tokenRefreshErrors: ["Token refresh failed for @alpha: boom"],
      expiringAccounts: [{ username: "alpha", expiresAt: new Date("2026-11-02T00:00:00Z") }],
    });
    expect(problems.map((p) => p.kind)).toEqual(["token_refresh_failed", "token_expiring"]);
    expect(problems[1].message).toContain("@alpha (scade il 2026-11-02)");
  });
});

describe("ops helpers", () => {
  it("drops Prisma-only parameters pg_dump would reject", () => {
    expect(pgDumpUrl("postgresql://u:p@db:5432/app?schema=public&sslmode=require")).toBe(
      "postgresql://u:p@db:5432/app?sslmode=require"
    );
  });

  it("signs the webhook body with HMAC-SHA256", () => {
    const expected = createHmac("sha256", "s3cret").update('{"a":1}').digest("hex");
    expect(signBody('{"a":1}', "s3cret")).toBe(`sha256=${expected}`);
  });

  it("sends ops mail to ALERT_EMAIL, else the first allowed address", () => {
    vi.stubEnv("ALERT_EMAIL", "");
    vi.stubEnv("ALLOWED_EMAILS", " owner@example.com, other@example.com");
    expect(getOpsRecipient()).toBe("owner@example.com");
    vi.stubEnv("ALERT_EMAIL", "alerts@example.com");
    expect(getOpsRecipient()).toBe("alerts@example.com");
    vi.unstubAllEnvs();
  });

  it("reads the keyword out of an ice breaker payload only", () => {
    expect(iceBreakerKeyword("ib:ALPHA")).toBe("ALPHA");
    expect(iceBreakerKeyword("ib:  ")).toBeNull();
    expect(iceBreakerKeyword("reveal:123")).toBeNull();
  });

  it("quotes CSV cells and defuses spreadsheet formulas", () => {
    expect(toCsv([["a,b", 'say "hi"', null, 3], ["=HYPERLINK(1)", "-2", "@x", "ok"]])).toBe(
      '"a,b","say ""hi""",,3\r\n\'=HYPERLINK(1),\'-2,\'@x,ok'
    );
  });
});
