import { afterEach, describe, expect, it, vi } from "vitest";

import { todayIso } from "./today";

describe("todayIso", () => {
  afterEach(() => vi.useRealTimers());

  it("KST 오전 1시는 UTC 로는 전날이지만 로컬 날짜(당일)를 돌려준다", () => {
    const tz = process.env.TZ;
    process.env.TZ = "Asia/Seoul";
    try {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-03T16:30:00Z")); // KST 2026-10-04 01:30
      expect(todayIso()).toBe("2026-10-04");
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
});
