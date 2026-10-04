import { describe, expect, it } from "vitest";

import type { CompensationResult } from "@lawcalc-kr/compensation";

import {
  buildCompensationExportWarnings,
  withCompensationExportWarnings,
} from "./compensation-warnings";

/**
 * 화면에만 있던 경고가 clipboard·PDF·CSV 에서 사라지던 결함의 회귀 가드.
 *
 * 상한 적용은 **실제로 금액이 잘렸다는 사실**이라, 실무에서 최종 산출물이 되는 PDF 산출근거에
 * 빠지면 안 된다.
 */
describe("buildCompensationExportWarnings", () => {
  const result = (over: Record<string, unknown> = {}) =>
    ({
      hoffman240Cap: { cappedAtIndex: null },
      ...over,
    }) as unknown as CompensationResult;

  it("경고가 없으면 빈 배열", () => {
    expect(buildCompensationExportWarnings(result())).toEqual([]);
  });

  it("일실수입 호프만 240 한도를 구간 번호와 함께 알린다", () => {
    const [message, ...rest] = buildCompensationExportWarnings(
      result({ hoffman240Cap: { cappedAtIndex: 2 } }),
    );
    expect(rest).toEqual([]);
    expect(message).toContain("일실수입");
    expect(message).toContain("3번째 구간");
  });

  // 엔진(`other-damages/attendant.ts`)이 만드는 문구 그대로.
  const coverage = (i: number) =>
    `개호비 향후[${i}] 기간이 호프만표 범위(사고일부터 1440개월)를 넘어 그 뒤는 현가율에 넣지 못했습니다. 금액이 실제보다 적습니다.`;

  it("직종 없는 엔진 경고(hoffmanCoverageClamped)는 여러 개여도 문구 그대로 모두 낸다", () => {
    const warnings = buildCompensationExportWarnings(
      result({
        warnings: [
          {
            code: "hoffmanCoverageClamped",
            message: coverage(0),
          },
          {
            code: "hoffmanCoverageClamped",
            message: coverage(1),
          },
        ],
      }),
    );
    expect(warnings).toEqual([coverage(0), coverage(1)]);
  });

  it("개호비 240 · 치료비 20 · 보조구 20 · 분할 의심을 모두 낸다", () => {
    const warnings = buildCompensationExportWarnings(
      result({
        otherDamages: {
          attendantCare: { hoffman240CappedAtIndex: 0 },
          treatment: { valueSum20Capped: true, splitSuspected: true },
          appliance: { valueSum20Capped: true },
        },
      }),
    );
    expect(warnings).toHaveLength(4);
    expect(warnings[0]).toContain("시작 시점 순으로 누적");
    expect(warnings[0]).toContain("1번째 입력 구간에서 240에 닿아");
    expect(warnings[1]).toContain("치료비");
    expect(warnings[2]).toContain("보조구");
    expect(warnings[3]).toContain("나눠 입력");
  });

  it("보조구에만 분할 의심이 있어도 잡는다", () => {
    const warnings = buildCompensationExportWarnings(
      result({ otherDamages: { appliance: { splitSuspected: true } } }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("나눠 입력");
  });

  it("엔진의 대체 처리 경고(직종 조사 중단 등) 문구를 맨 앞에 그대로 싣는다", () => {
    const warnings = buildCompensationExportWarnings(
      result({
        hoffman240Cap: { cappedAtIndex: 0 },
        warnings: [
          {
            code: "laborRateCarriedForward",
            occupation: "갱부",
            message: "갱부 단가를 이어 썼습니다.",
          },
        ],
      }),
    );
    expect(warnings[0]).toBe("갱부 단가를 이어 썼습니다.");
    expect(warnings).toHaveLength(2);
  });

  it("`cappedAtIndex: 0` 을 경고 없음으로 오판하지 않는다", () => {
    // falsy 검사로 짜면 첫 구간부터 한도가 걸린 사건이 통째로 조용해진다.
    expect(
      buildCompensationExportWarnings(result({ hoffman240Cap: { cappedAtIndex: 0 } })),
    ).toHaveLength(1);
  });

  it("withCompensationExportWarnings 는 결과를 보존한 채 필드만 덧붙인다", () => {
    const base = result({
      hoffman240Cap: { cappedAtIndex: 1 },
      finalWon: 123,
      faultOffset: { afterWon: 0 },
      deductions: { ratioSubtotalWon: 0, absoluteSubtotalWon: 0, afterWon: 0 },
    });
    const payload = withCompensationExportWarnings(base);
    expect(payload.finalWon).toBe(123);
    expect(payload.exportWarnings).toHaveLength(1);
    expect(payload.propertyOnlyExcessWon).toBe(0);
  });
});
