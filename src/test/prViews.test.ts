import { describe, expect, it } from "vitest";
import { sortReviewRequestsOldestFirst } from "../core/services/prViews";

describe("review queue sorting", () => {
  it("sorts oldest first", () => {
    const sorted = sortReviewRequestsOldestFirst([
      { id: "2", createdAt: "2026-02-13T10:00:00.000Z" },
      { id: "1", createdAt: "2026-02-12T10:00:00.000Z" }
    ] as never[]);

    expect(sorted[0]?.id).toBe("1");
  });

  it("keeps direct requests above team requests", () => {
    const sorted = sortReviewRequestsOldestFirst([
      { id: "team-oldest", requestOrigin: "team", createdAt: "2026-02-10T10:00:00.000Z" },
      { id: "direct-newer", requestOrigin: "direct", createdAt: "2026-02-12T10:00:00.000Z" },
      { id: "direct-oldest", requestOrigin: "direct", createdAt: "2026-02-11T10:00:00.000Z" },
      { id: "team-newer", requestOrigin: "team", createdAt: "2026-02-13T10:00:00.000Z" }
    ] as never[]);

    expect(sorted.map((item) => item.id)).toEqual([
      "direct-oldest",
      "direct-newer",
      "team-oldest",
      "team-newer"
    ]);
  });
});
