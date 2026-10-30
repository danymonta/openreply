import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ prisma: {} }));

import { interactionSource, parsePeriodDays } from "../lib/analytics/advanced";

describe("advanced analytics helpers", () => {
  it("classifies a log by what triggered it", () => {
    expect(interactionSource({ commentId: "17890001", commentText: "GUIDA" })).toBe("comment");
    expect(interactionSource({ commentId: "dm:mid_1", commentText: "PRONTO" })).toBe("dm");
    expect(interactionSource({ commentId: "reveal:123", commentText: "(button tap)" })).toBe("button");
  });

  it("accepts only the offered periods, defaulting to 30 days", () => {
    expect(parsePeriodDays("7")).toBe(7);
    expect(parsePeriodDays("365")).toBe(365);
    expect(parsePeriodDays("12")).toBe(30);
    expect(parsePeriodDays(null)).toBe(30);
  });
});
