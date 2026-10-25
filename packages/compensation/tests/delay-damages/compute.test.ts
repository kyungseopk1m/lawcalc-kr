import { describe, expect, it } from "vitest";

import { buildDelayDamagesOrderText, computeDelayDamages } from "../../src/delay-damages";

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * 엔진과 독립된 BigInt 손계산 (기본 옵션: 기간식, 윤년 실일수, 초일 산입, 절사).
 * 이율은 법령 원문에서 직접 옮긴 값이다 (데이터셋을 읽지 않는다).
 * 합계는 이율 구간마다 원 미만을 버린 금액의 합이다 (2026-10-22 core-engine 행별 절사 규칙,
 * 종전에는 raw 합계를 한 번에 버려 최대 (구간 수 - 1)원 컸다).
 */
function addYear(d: string): string {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y + 1, m - 1, day));
  // 02-29 + 1년이 평년이면 03-01 로 넘어가므로 02-28 로 되돌린다.
  return next.getUTCMonth() !== m - 1 ? `${y + 1}-02-28` : iso(next.getTime());
}
function cycleEnd(c: string): string {
  const n = addYear(c);
  return c.endsWith("-02-29") && n.endsWith("-02-28") ? n : iso(ms(n) - DAY);
}
function hasLeapDay(a: string, b: string): boolean {
  for (let y = Number(a.slice(0, 4)); y <= Number(b.slice(0, 4)); y++) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const d = `${y}-02-29`;
    if (leap && d >= a && d <= b) return true;
  }
  return false;
}
function promotionRate(d: string): bigint {
  return d < "2015-10-01" ? 20n : d < "2019-06-01" ? 15n : 12n;
}
/**
 * 부칙 제2조 문언 그대로: 개정 시행일 E 는 제1심 변론종결일 C >= E 일 때만 이율을 바꾸고
 * (제2항), C < E 면 종전 이율을 유지한다 (제1항). 즉 날짜 d 의 이율 = min(d, C) 시점 이율.
 */
function oracle(
  p: number,
  start: string,
  judgment: string,
  end: string,
  closing = judgment,
): bigint {
  const segs: Array<[string, string, bigint]> = [[start, end < judgment ? end : judgment, 5n]];
  let cur = iso(ms(judgment) + DAY);
  while (cur <= end) {
    const boundary = ["2015-10-01", "2019-06-01"].find((b) => b > cur && b <= closing);
    const to = boundary && boundary <= end ? iso(ms(boundary) - DAY) : end;
    segs.push([cur, to, promotionRate(cur < closing ? cur : closing)]);
    cur = iso(ms(to) + DAY);
  }
  let total = 0n;
  for (const [a, b, r] of segs) {
    let c = a;
    let full = 0n;
    while (cycleEnd(c) <= b) {
      full += 1n;
      c = iso(ms(cycleEnd(c)) + DAY);
    }
    const days = c <= b ? BigInt(Math.round((ms(b) - ms(c)) / DAY) + 1) : 0n;
    const leap = days > 0n && hasLeapDay(c, iso(ms(addYear(c)) - DAY));
    const denom = leap ? 366n : 365n;
    total += (BigInt(p) * r * (full * denom + days)) / (100n * denom);
  }
  return total;
}

const base = { principalWon: 100_000_000 };

describe("computeDelayDamages", () => {
  it("기준일 < 선고일이면 민법 5% 구간만", () => {
    const r = computeDelayDamages({
      ...base,
      startDate: "2025-01-01",
      judgmentDate: "2026-12-31",
      endDate: "2025-12-31",
    });
    expect(r.segments.map((s) => [s.from, s.to, s.rate])).toEqual([
      ["2025-01-01", "2025-12-31", 0.05],
    ]);
    expect(r.totalInterest).toBe(5_000_000);
  });

  it("5% + 12%", () => {
    const r = computeDelayDamages({
      ...base,
      startDate: "2025-03-01",
      judgmentDate: "2026-02-28",
      endDate: "2027-02-28",
    });
    expect(r.segments.map((s) => [s.from, s.to, s.rate])).toEqual([
      ["2025-03-01", "2026-02-28", 0.05],
      ["2026-03-01", "2027-02-28", 0.12],
    ]);
    expect(r.totalInterest).toBe(17_000_000);
  });

  it("선고 2019-03-15, 기준일 2020-03-31: 부칙 경과조치로 2019-06-01 이후도 15%", () => {
    const r = computeDelayDamages({
      ...base,
      startDate: "2018-01-01",
      judgmentDate: "2019-03-15",
      endDate: "2020-03-31",
    });
    expect(r.segments.map((s) => [s.from, s.to, s.rate])).toEqual([
      ["2018-01-01", "2019-03-15", 0.05],
      ["2019-03-16", "2020-03-31", 0.15],
    ]);
    expect(BigInt(r.totalInterest)).toBe(
      oracle(base.principalWon, "2018-01-01", "2019-03-15", "2020-03-31"),
    );
  });

  it("변론종결 2019-05-20 + 선고 2019-07-10 이면 12% 대신 15%, 변론종결 2019-06-03 이면 12%", () => {
    const run = (firstInstanceClosingDate: string) =>
      computeDelayDamages({
        ...base,
        startDate: "2018-01-01",
        firstInstanceClosingDate,
        judgmentDate: "2019-07-10",
        endDate: "2020-12-31",
      });
    expect(run("2019-05-20").segments[1]!.rate).toBe(0.15);
    expect(run("2019-05-31").segments[1]!.rate).toBe(0.15);
    expect(run("2019-06-01").segments[1]!.rate).toBe(0.12);
    expect(run("2019-06-03").segments[1]!.rate).toBe(0.12);
    // 행별 절사: 5% 2018-01-01~2019-07-10 = 5,000,000 + 100,000,000 × 5% × 191/365 (2,616,438.36)
    // → 7,616,438, 15% 2019-07-11~2020-12-31 = 15,000,000 + 15,000,000 × 174/365 (7,150,684.93)
    // → 22,150,684, 합 29,767,122 (종전 raw 합 절사 29,767,123).
    expect(run("2019-05-20").totalInterest).toBe(29_767_122);
    expect(BigInt(run("2019-05-20").totalInterest)).toBe(
      oracle(base.principalWon, "2018-01-01", "2019-07-10", "2020-12-31", "2019-05-20"),
    );
  });

  it("변론종결 2015-09-30 이면 두 개정 모두 넘어 20% 유지", () => {
    const r = computeDelayDamages({
      ...base,
      startDate: "2015-01-01",
      firstInstanceClosingDate: "2015-09-30",
      judgmentDate: "2015-11-20",
      endDate: "2020-12-31",
    });
    expect(r.segments.map((s) => s.rate)).toEqual([0.05, 0.2]);
  });

  it("변론종결일이 기산일 앞이거나 선고일 뒤면 거부", () => {
    for (const firstInstanceClosingDate of ["2017-12-31", "2019-07-11"]) {
      expect(() =>
        computeDelayDamages({
          ...base,
          startDate: "2018-01-01",
          firstInstanceClosingDate,
          judgmentDate: "2019-07-10",
          endDate: "2020-12-31",
        }),
      ).toThrow(RangeError);
    }
  });

  it("전환일 = 기준일이면 민법 구간만, 선고일 당일까지 5%", () => {
    const r = computeDelayDamages({
      ...base,
      startDate: "2025-03-01",
      judgmentDate: "2026-02-28",
      endDate: "2026-02-28",
    });
    expect(r.segments).toHaveLength(1);
    expect(r.totalInterest).toBe(5_000_000);
  });

  it("기산일 = 선고일이면 하루치 5% 후 소촉법", () => {
    const r = computeDelayDamages({
      ...base,
      startDate: "2026-01-01",
      judgmentDate: "2026-01-01",
      endDate: "2026-01-02",
    });
    expect(r.segments.map((s) => [s.days, s.rate])).toEqual([
      [1, 0.05],
      [1, 0.12],
    ]);
  });

  it("기준일 < 기산일, 선고일 < 기산일 거부", () => {
    expect(() =>
      computeDelayDamages({
        ...base,
        startDate: "2026-01-02",
        judgmentDate: "2026-06-30",
        endDate: "2026-01-01",
      }),
    ).toThrow(RangeError);
    expect(() =>
      computeDelayDamages({
        ...base,
        startDate: "2026-01-02",
        judgmentDate: "2026-01-01",
        endDate: "2026-12-31",
      }),
    ).toThrow(RangeError);
  });

  it("원금 0·음수·소수 거부", () => {
    for (const principalWon of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        computeDelayDamages({
          principalWon,
          startDate: "2026-01-01",
          judgmentDate: "2026-06-30",
          endDate: "2026-12-31",
        }),
      ).toThrow(RangeError);
    }
  });

  it("소촉법 시행(2003-06-01) 전 선고는 거부", () => {
    expect(() =>
      computeDelayDamages({
        ...base,
        startDate: "2002-01-01",
        judgmentDate: "2003-01-01",
        endDate: "2004-01-01",
      }),
    ).toThrow(/promotion/);
  });

  it("퍼징: 만 원 단위 원금, 독립 BigInt 계산과 원 단위 일치", () => {
    let seed = 20261004;
    const rand = (n: number) => {
      seed = (seed * 48_271) % 2_147_483_647;
      return seed % n;
    };
    const lo = ms("2003-06-01");
    const span = Math.round((ms("2026-10-04") - lo) / DAY);
    for (let i = 0; i < 400; i++) {
      const principalWon = (1 + rand(100_000)) * 10_000;
      const judgment = iso(lo + rand(span) * DAY);
      const start = iso(ms(judgment) - rand(2_000) * DAY);
      const end = iso(ms(start) + rand(4_000) * DAY);
      const back = iso(ms(judgment) - rand(400) * DAY);
      const firstInstanceClosingDate = [back, start, "2003-06-01"].sort().at(-1)!;
      const r = computeDelayDamages({
        principalWon,
        startDate: start,
        firstInstanceClosingDate,
        judgmentDate: judgment,
        endDate: end,
      });
      expect(
        BigInt(r.totalInterest),
        `${principalWon} ${start} ${firstInstanceClosingDate} ${judgment} ${end}`,
      ).toBe(oracle(principalWon, start, judgment, end, firstInstanceClosingDate));
    }
  });
});

describe("buildDelayDamagesOrderText", () => {
  it("주문형 문구 (선고일 다음 날 소촉법 12%)", () => {
    expect(
      buildDelayDamagesOrderText({
        principalWon: 289_813_253,
        startDate: "2025-03-01",
        judgmentDate: "2026-09-30",
      }),
    ).toBe(
      "289,813,253원 및 이에 대하여 2025. 3. 1.부터 2026. 9. 30.까지는 민법이 정한 연 5%, 그 다음 날부터 다 갚는 날까지는 소송촉진 등에 관한 특례법이 정한 연 12%의 각 비율로 계산한 돈",
    );
  });

  it("이율은 변론종결일(미입력 시 선고일) 시점: 2019-05-31 선고 15%, 2019-06-01 선고 12%, 변론종결 2019-05-20 이면 15%", () => {
    const text = (judgmentDate: string, firstInstanceClosingDate?: string) =>
      buildDelayDamagesOrderText({
        principalWon: 10_000,
        startDate: "2018-01-01",
        judgmentDate,
        firstInstanceClosingDate,
      });
    expect(text("2019-05-31")).toContain("특례법이 정한 연 15%");
    expect(text("2019-06-01")).toContain("특례법이 정한 연 12%");
    expect(text("2019-07-10", "2019-05-20")).toContain("특례법이 정한 연 15%");
  });
});
