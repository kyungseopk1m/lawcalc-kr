import { describe, expect, it } from "vitest";

import {
  CASE_TYPE_META,
  computeDeliveryFee,
  deliveryDatasetVersionTag,
  getDeliveryCount,
  getDeliveryUnitPriceAt,
  loadDeliveryDataset,
  type DeliveryDataset,
  type DeliveryFeeInput,
} from "../src";

const FROZEN_AT = "2026-05-11T00:00:00.000Z";

/**
 * 현행 단가·dataset 태그는 dataset 단일 출처에서 읽는다.
 *
 * 송달료 단가는 우편요금 인상마다 바뀌는데, 회수 매트릭스를 검증하는 아래 테스트들이
 * 단가 리터럴을 각자 들고 있으면 인상 한 번에 십수 건이 함께 깨진다. 그 테스트들이
 * 실제로 지키려는 것은 사건구분별 회수와 산식이지 단가 값이 아니다.
 * 단가 값과 시행일 자체는 바로 아래 "기본 dataset" 블록이 리터럴로 고정한다.
 */
const CURRENT_UNIT_WON = getDeliveryUnitPriceAt(loadDeliveryDataset()).unitPriceWon;
const CURRENT_TAG = deliveryDatasetVersionTag(loadDeliveryDataset());

function input(overrides: Partial<DeliveryFeeInput> = {}): DeliveryFeeInput {
  return {
    caseType: "civilFirstInstanceCollegial",
    partyCount: 2,
    ...overrides,
  };
}

describe("loadDeliveryDataset / 기본 dataset", () => {
  it("inline default dataset 을 검증 후 로드한다", () => {
    const ds = loadDeliveryDataset();
    expect(ds.version).toBe("1.3.0");
    expect(ds.unitPriceHistory).toHaveLength(5);
    // 현행 단가 5,640원, 2026-07-01 시행. 법제처 생활법령정보 '인지액 및 송달료' +
    // 대한법률구조공단 자동계산기 고지("2026. 7. 1. 송달료 5,640원으로 인상")로 대조.
    expect(ds.unitPriceHistory[0]!.unitPriceWon).toBe(5640);
    expect(ds.unitPriceHistory[0]!.effectiveFrom).toBe("2026-07-01");
    expect(ds.countMatrix).toHaveLength(41);
    expect(ds.unverifiedMatrix).toHaveLength(0);
  });

  it("단가 이력은 시행일 내림차순이고 중복이 없다", () => {
    const dates = loadDeliveryDataset().unitPriceHistory.map((e) => e.effectiveFrom);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("deliveryDatasetVersionTag 는 delivery/v1.3.0", () => {
    expect(deliveryDatasetVersionTag(loadDeliveryDataset())).toBe("delivery/v1.3.0");
  });

  it("음수 unitPriceWon 거부", () => {
    const ds = loadDeliveryDataset();
    const bad: DeliveryDataset = {
      ...ds,
      unitPriceHistory: [
        { ...ds.unitPriceHistory[0]!, unitPriceWon: -1 },
        ...ds.unitPriceHistory.slice(1),
      ],
    };
    expect(() => loadDeliveryDataset(bad)).toThrow(/unitPriceWon/);
  });

  it("unitPriceHistory 가 비어있으면 거부", () => {
    const ds = loadDeliveryDataset();
    const bad: DeliveryDataset = { ...ds, unitPriceHistory: [] };
    expect(() => loadDeliveryDataset(bad)).toThrow(/non-empty/);
  });

  it("unitPriceHistory 가 오름차순이면 거부 (내림차순 강제)", () => {
    const ds = loadDeliveryDataset();
    const bad: DeliveryDataset = {
      ...ds,
      unitPriceHistory: [...ds.unitPriceHistory].reverse(),
    };
    expect(() => loadDeliveryDataset(bad)).toThrow(/DESC/);
  });

  it("countMatrix 중복 caseType 거부", () => {
    const ds = loadDeliveryDataset();
    const bad: DeliveryDataset = {
      ...ds,
      countMatrix: [...ds.countMatrix, ds.countMatrix[0]!],
    };
    expect(() => loadDeliveryDataset(bad)).toThrow(/duplicate caseType/);
  });

  it("unverifiedMatrix 의 caseType 이 countMatrix 와 겹치면 거부", () => {
    const ds = loadDeliveryDataset();
    const overlap = ds.countMatrix[0]!.caseType;
    const bad: DeliveryDataset = {
      ...ds,
      unverifiedMatrix: [
        {
          caseType: overlap,
          labelKo: "충돌",
          draftFormula: { kind: "simplePerParty", countPerParty: 1 },
          verificationPending: "test conflict",
        },
      ],
    };
    expect(() => loadDeliveryDataset(bad)).toThrow(/already present in countMatrix/);
  });

  it("matrixDelegation.sourceUrl 누락 거부", () => {
    const ds = loadDeliveryDataset();
    const bad: DeliveryDataset = {
      ...ds,
      matrixDelegation: { ...ds.matrixDelegation, sourceUrl: "" },
    };
    expect(() => loadDeliveryDataset(bad)).toThrow(/matrixDelegation/);
  });

  it("historyNote.unitPriceChangesCount 불일치 거부", () => {
    const ds = loadDeliveryDataset();
    const bad: DeliveryDataset = {
      ...ds,
      historyNote: { ...ds.historyNote, unitPriceChangesCount: 99 },
    };
    expect(() => loadDeliveryDataset(bad)).toThrow(/unitPriceChangesCount/);
  });
});

describe("getDeliveryUnitPriceAt / 시기별 단가 (5 슬라이스)", () => {
  const ds = loadDeliveryDataset();

  it("filingDate 미지정 → 현행 단가 (이력 첫 슬라이스)", () => {
    const entry = getDeliveryUnitPriceAt(ds);
    expect(entry.unitPriceWon).toBe(CURRENT_UNIT_WON);
    expect(entry.effectiveFrom).toBe(ds.unitPriceHistory[0]!.effectiveFrom);
  });

  it('"2025-06-01" → 5,500원 (경계 진입)', () => {
    expect(getDeliveryUnitPriceAt(ds, "2025-06-01").unitPriceWon).toBe(5500);
  });

  it('"2025-05-31" → 5,200원 (2021-09-01 슬라이스)', () => {
    expect(getDeliveryUnitPriceAt(ds, "2025-05-31").unitPriceWon).toBe(5200);
  });

  it('"2021-09-01" → 5,200원 (경계 진입)', () => {
    expect(getDeliveryUnitPriceAt(ds, "2021-09-01").unitPriceWon).toBe(5200);
  });

  it('"2021-08-31" → 5,100원 (2020-07-01 슬라이스)', () => {
    expect(getDeliveryUnitPriceAt(ds, "2021-08-31").unitPriceWon).toBe(5100);
  });

  it('"2020-07-01" → 5,100원 (경계 진입)', () => {
    expect(getDeliveryUnitPriceAt(ds, "2020-07-01").unitPriceWon).toBe(5100);
  });

  it('"2020-06-30" → 4,800원 (2019-05-01 슬라이스)', () => {
    expect(getDeliveryUnitPriceAt(ds, "2020-06-30").unitPriceWon).toBe(4800);
  });

  it('"2019-05-01" → 4,800원 (경계 진입, 가장 이른 슬라이스)', () => {
    expect(getDeliveryUnitPriceAt(ds, "2019-05-01").unitPriceWon).toBe(4800);
  });

  it('"2019-04-30" → throw (모든 슬라이스보다 이른 시점)', () => {
    expect(() => getDeliveryUnitPriceAt(ds, "2019-04-30")).toThrow(/모든 슬라이스보다 이른/);
  });

  it("invalid filingDate 형식 거부 (ISO 패턴 불일치)", () => {
    expect(() => getDeliveryUnitPriceAt(ds, "2025/01/01")).toThrow(/invalid ISO date/);
  });
});

describe("getDeliveryCount / 매트릭스 lookup", () => {
  const ds = loadDeliveryDataset();

  it("민사 제1심 합의 (가합) — simplePerParty(15)", () => {
    const entry = getDeliveryCount(ds, "civilFirstInstanceCollegial");
    expect(entry.formula).toEqual({ kind: "simplePerParty", countPerParty: 15 });
  });

  it("민사 항소 (나) — simplePerParty(12)", () => {
    const entry = getDeliveryCount(ds, "civilAppeal");
    expect(entry.formula).toEqual({ kind: "simplePerParty", countPerParty: 12 });
  });

  it("민사 (재)항고 (라/마) — simplePerParty(5) (G3 의 range(3,5) → 정정)", () => {
    const entry = getDeliveryCount(ds, "civilInterlocutoryAppeal");
    expect(entry.formula).toEqual({ kind: "simplePerParty", countPerParty: 5 });
  });

  it("민사가압류 합의 (카합) — simplePerParty(3), 임시지위 가처분 8회", () => {
    const entry = getDeliveryCount(ds, "provisionalMeasureCollegial");
    expect(entry.formula).toEqual({
      kind: "simplePerParty",
      countPerParty: 3,
      provisionalStatusCountPerParty: 8,
    });
  });

  it("민사가압류 단독 (카단) — simplePerParty(3), 임시지위 가처분 8회", () => {
    const entry = getDeliveryCount(ds, "provisionalMeasureSingle");
    expect(entry.formula).toEqual({
      kind: "simplePerParty",
      countPerParty: 3,
      provisionalStatusCountPerParty: 8,
    });
  });

  it("paymentOrder (차) → simplePerParty 6회 (재일 87-4 별표 1 정본)", () => {
    const entry = getDeliveryCount(ds, "paymentOrder");
    expect(entry.formula).toEqual({ kind: "simplePerParty", countPerParty: 6 });
  });
});

describe("computeDeliveryFee / 산식 분기 + 시기별 단가", () => {
  it("민사 제1심 합의 (가합), 당사자 2명, 현행 단가 = 2 × 15 × 회당 단가", () => {
    const r = computeDeliveryFee(
      input({ caseType: "civilFirstInstanceCollegial", partyCount: 2 }),
      {
        computedAt: FROZEN_AT,
      },
    );
    expect(r.deliveryCount).toBe(30);
    expect(r.perDeliveryUnitPriceWon).toBe(CURRENT_UNIT_WON);
    expect(r.amount).toBe(2 * 15 * CURRENT_UNIT_WON);
    expect(r.dataVersion).toBe(CURRENT_TAG);
    expect(r.computedAt).toBe(FROZEN_AT);
  });

  it("민사 항소 (나), 당사자 3명, 현행 = 3 × 12 × 회당 단가", () => {
    const r = computeDeliveryFee(input({ caseType: "civilAppeal", partyCount: 3 }), {
      computedAt: FROZEN_AT,
    });
    expect(r.deliveryCount).toBe(36);
    expect(r.amount).toBe(3 * 12 * CURRENT_UNIT_WON);
  });

  it("민사 (재)항고 (라/마), 당사자 1명 = 1 × 5 × 회당 단가", () => {
    const r = computeDeliveryFee(input({ caseType: "civilInterlocutoryAppeal", partyCount: 1 }), {
      computedAt: FROZEN_AT,
    });
    expect(r.deliveryCount).toBe(5);
    expect(r.amount).toBe(1 * 5 * CURRENT_UNIT_WON);
  });

  it("민사가압류 합의 (카합), 당사자 2명 = 2 × 3 × 회당 단가", () => {
    const r = computeDeliveryFee(
      input({ caseType: "provisionalMeasureCollegial", partyCount: 2 }),
      {
        computedAt: FROZEN_AT,
      },
    );
    expect(r.deliveryCount).toBe(6);
    expect(r.amount).toBe(2 * 3 * CURRENT_UNIT_WON);
  });

  it("행정 제1심 (구), 당사자 2명 = 2 × 10 × 회당 단가", () => {
    const r = computeDeliveryFee(
      input({ caseType: "administrativeFirstInstance", partyCount: 2 }),
      {
        computedAt: FROZEN_AT,
      },
    );
    expect(r.deliveryCount).toBe(20);
    expect(r.amount).toBe(2 * 10 * CURRENT_UNIT_WON);
  });

  it("paymentOrder (차), 당사자 2명 (채권자·채무자) = 2 × 6 × 회당 단가", () => {
    const r = computeDeliveryFee(input({ caseType: "paymentOrder", partyCount: 2 }), {
      computedAt: FROZEN_AT,
    });
    expect(r.deliveryCount).toBe(12);
    expect(r.perDeliveryUnitPriceWon).toBe(CURRENT_UNIT_WON);
    expect(r.amount).toBe(2 * 6 * CURRENT_UNIT_WON);
    expect(r.dataVersion).toBe(CURRENT_TAG);
  });

  it("filingDate=2020-06-30 → 4,800원 적용 (2019-05-01 슬라이스)", () => {
    const r = computeDeliveryFee(
      input({ caseType: "civilFirstInstanceCollegial", partyCount: 1, filingDate: "2020-06-30" }),
      { computedAt: FROZEN_AT },
    );
    expect(r.perDeliveryUnitPriceWon).toBe(4800);
    expect(r.amount).toBe(15 * 1 * 4800);
  });

  it("filingDate=2022-01-01 → 5,200원 적용 (2021-09-01 슬라이스)", () => {
    const r = computeDeliveryFee(
      input({ caseType: "civilFirstInstanceCollegial", partyCount: 1, filingDate: "2022-01-01" }),
      { computedAt: FROZEN_AT },
    );
    expect(r.perDeliveryUnitPriceWon).toBe(5200);
    expect(r.amount).toBe(15 * 1 * 5200);
  });

  it("perDeliveryUnitPriceWon override 가 filingDate 보다 우선", () => {
    const r = computeDeliveryFee(
      input({
        caseType: "civilFirstInstanceCollegial",
        partyCount: 1,
        filingDate: "2022-01-01",
        perDeliveryUnitPriceWon: 9000,
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.perDeliveryUnitPriceWon).toBe(9000);
    expect(r.amount).toBe(15 * 9000);
  });
});

describe("computeDeliveryFee / 4 kind 분기 (custom dataset)", () => {
  const baseDataset = loadDeliveryDataset();

  function withFormula(
    formula: DeliveryDataset["countMatrix"][number]["formula"],
  ): DeliveryDataset {
    return {
      ...baseDataset,
      version: "test-formula",
      countMatrix: [
        {
          caseType: "civilFirstInstanceCollegial",
          labelKo: "test",
          formula,
          verifiedBy: ["test"],
        },
        ...baseDataset.countMatrix.slice(1),
      ],
    };
  }

  it("partyOffsetTimesCount: (partyCount + offset) × countPerParty", () => {
    const ds = withFormula({
      kind: "partyOffsetTimesCount",
      countPerParty: 10,
      partyOffset: 3,
      partyBasis: "stakeholders",
    });
    const r = computeDeliveryFee(input({ partyCount: 2 }), {
      dataset: ds,
      computedAt: FROZEN_AT,
    });
    expect(r.deliveryCount).toBe((2 + 3) * 10);
    expect(r.amount).toBe(50 * CURRENT_UNIT_WON);
  });

  it("baseCountPlusCreditorMultiple: base + creditorCount × creditorMultiple", () => {
    const ds = withFormula({
      kind: "baseCountPlusCreditorMultiple",
      baseCount: 10,
      creditorMultiple: 8,
    });
    const r = computeDeliveryFee(input({ partyCount: 1, creditorCount: 5 }), {
      dataset: ds,
      computedAt: FROZEN_AT,
    });
    expect(r.deliveryCount).toBe(10 + 5 * 8);
  });

  it("baseCountPlusCreditorMultiple + creditorCount 미지정 → RangeError", () => {
    const ds = withFormula({
      kind: "baseCountPlusCreditorMultiple",
      baseCount: 10,
      creditorMultiple: 8,
    });
    expect(() => computeDeliveryFee(input({ partyCount: 1 }), { dataset: ds })).toThrow(
      /creditorCount 가 필요/,
    );
  });

  it("range: customCount 가 [countMin, countMax] 범위 내", () => {
    const ds = withFormula({
      kind: "range",
      countMin: 3,
      countMax: 5,
      partyBasis: "appellantPlusOpponent",
    });
    const r = computeDeliveryFee(input({ partyCount: 1, customCount: 4 }), {
      dataset: ds,
      computedAt: FROZEN_AT,
    });
    expect(r.deliveryCount).toBe(4);
  });

  it("range + customCount 미지정 → RangeError", () => {
    const ds = withFormula({
      kind: "range",
      countMin: 3,
      countMax: 5,
      partyBasis: "appellantPlusOpponent",
    });
    expect(() => computeDeliveryFee(input({ partyCount: 1 }), { dataset: ds })).toThrow(
      /customCount 가 필요/,
    );
  });

  it("range + customCount 가 범위 밖 → RangeError", () => {
    const ds = withFormula({
      kind: "range",
      countMin: 3,
      countMax: 5,
      partyBasis: "appellantPlusOpponent",
    });
    expect(() =>
      computeDeliveryFee(input({ partyCount: 1, customCount: 10 }), { dataset: ds }),
    ).toThrow(/허용 범위/);
  });
});

describe("computeDeliveryFee / validator integration", () => {
  it("음수 partyCount → RangeError", () => {
    expect(() => computeDeliveryFee(input({ partyCount: -1 }))).toThrow(/송달료 입력 검증 실패/);
  });

  it("0 partyCount → RangeError (양의 정수 강제)", () => {
    expect(() => computeDeliveryFee(input({ partyCount: 0 }))).toThrow(/양의 정수/);
  });

  it("잘못된 caseType → RangeError", () => {
    expect(() =>
      computeDeliveryFee({
        ...input(),
        caseType: "nonExistentCase" as DeliveryFeeInput["caseType"],
      }),
    ).toThrow(/사건구분이 유효하지 않습니다/);
  });

  it("잘못된 filingDate 형식 → RangeError", () => {
    expect(() => computeDeliveryFee(input({ filingDate: "not-a-date" }))).toThrow(/ISO 형식/);
  });
});

describe("computeDeliveryFee / dataset injection 결정성", () => {
  it("default 호출 → bundled dataset 사용 (현행 단가)", () => {
    const r = computeDeliveryFee(input({ partyCount: 1 }), { computedAt: FROZEN_AT });
    expect(r.perDeliveryUnitPriceWon).toBe(CURRENT_UNIT_WON);
    expect(r.dataVersion).toBe(CURRENT_TAG);
  });

  it("custom dataset 주입 → dataVersion 변경", () => {
    const ds = loadDeliveryDataset();
    const custom: DeliveryDataset = { ...ds, version: "9.9.9-test" };
    const r = computeDeliveryFee(input({ partyCount: 1 }), {
      dataset: custom,
      computedAt: FROZEN_AT,
    });
    expect(r.dataVersion).toBe("delivery/v9.9.9-test");
  });

  it("잘못된 dataset 주입 → validate 단계에서 throw", () => {
    const ds = loadDeliveryDataset();
    const bad: DeliveryDataset = {
      ...ds,
      unitPriceHistory: [
        { ...ds.unitPriceHistory[0]!, unitPriceWon: -1 },
        ...ds.unitPriceHistory.slice(1),
      ],
    };
    expect(() => computeDeliveryFee(input({ partyCount: 1 }), { dataset: bad })).toThrow(
      /unitPriceWon/,
    );
  });

  it("computedAt override 가 결과에 반영된다", () => {
    const r = computeDeliveryFee(input({ partyCount: 1 }), { computedAt: FROZEN_AT });
    expect(r.computedAt).toBe(FROZEN_AT);
  });
});

describe("computeDeliveryFee / formulaText 회귀", () => {
  it("simplePerParty 산식: 라벨 + 회수 + 단가 + 합산", () => {
    const r = computeDeliveryFee(
      input({ caseType: "civilFirstInstanceCollegial", partyCount: 2 }),
      {
        computedAt: FROZEN_AT,
      },
    );
    expect(r.formulaText).toContain("민사 제1심 합의 (가합)");
    expect(r.formulaText).toContain("당사자수 2 × 15회");
    expect(r.formulaText).toContain("30회 송달");
    expect(r.formulaText).toContain(`회당 단가 ${CURRENT_UNIT_WON.toLocaleString("ko-KR")}원`);
    expect(r.formulaText).toContain(`${(30 * CURRENT_UNIT_WON).toLocaleString("ko-KR")}원`);
  });

  it("filingDate 지정 시 formulaText 에 시기별 메타 포함", () => {
    const r = computeDeliveryFee(
      input({ caseType: "civilFirstInstanceCollegial", partyCount: 1, filingDate: "2020-06-30" }),
      { computedAt: FROZEN_AT },
    );
    expect(r.formulaText).toContain("2019-05-01 시행 슬라이스");
    expect(r.formulaText).toContain("filingDate 2020-06-30");
  });

  it("직접 입력 단가 사용 시 formulaText 에 직접 입력 메타 포함", () => {
    const r = computeDeliveryFee(
      input({
        caseType: "civilFirstInstanceCollegial",
        partyCount: 1,
        perDeliveryUnitPriceWon: 9000,
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.formulaText).toContain("직접 입력");
  });
});

/**
 * 2026-08-27 확장분 (countMatrix 13 → 40).
 *
 * 정본 대조는 대법원 전자소송 소송비용계산(`PSP007P01.xml`) 의 9개 소송유형 탭이다.
 * 아래는 그 탭들이 명시한 산식을 회수(count)로 검증한다. 금액이 아니라 회수를 보는 이유는
 * 위 CURRENT_UNIT_WON 주석과 같다 — 단가가 바뀌어도 매트릭스는 그대로여야 한다.
 */
describe("computeDeliveryFee / 확장 사건구분 (전자소송 대조)", () => {
  it("부동산등 경매(타경): (이해관계인수 + 3) × 10회", () => {
    const r = computeDeliveryFee(input({ caseType: "executionRealEstateAuction", partyCount: 2 }), {
      computedAt: FROZEN_AT,
    });
    expect(r.deliveryCount).toBe((2 + 3) * 10);
  });

  it("개인회생(개회): 10회 + 채권자수 × 8회", () => {
    const r = computeDeliveryFee(
      input({ caseType: "rehabilitationIndividual", partyCount: 1, creditorCount: 5 }),
      { computedAt: FROZEN_AT },
    );
    expect(r.deliveryCount).toBe(10 + 5 * 8);
  });

  it("면책(하면)은 채권자 배수가 3, 개인파산(하단)은 4, 법인은 기본 40회", () => {
    const count = (caseType: DeliveryFeeInput["caseType"]) =>
      computeDeliveryFee(input({ caseType, partyCount: 1, creditorCount: 2 }), {
        computedAt: FROZEN_AT,
      }).deliveryCount;
    expect(count("bankruptcyDischarge")).toBe(10 + 2 * 3);
    expect(count("bankruptcyIndividual")).toBe(10 + 2 * 4);
    expect(count("rehabilitationCorporate")).toBe(40 + 2 * 3);
  });

  it("재산조회(카조): 신청인수 × 2회 + 우편 조회대상 기관수 가산", () => {
    const withInstitutions = computeDeliveryFee(
      input({ caseType: "executionAssetInquiry", partyCount: 1, extraCount: 3 }),
      { computedAt: FROZEN_AT },
    );
    expect(withInstitutions.deliveryCount).toBe(1 * 2 + 3);
    // 기관 가산은 선택 입력이다. 미지정 시 0 으로 보고 본문 산식만 적용한다.
    const withoutInstitutions = computeDeliveryFee(
      input({ caseType: "executionAssetInquiry", partyCount: 1 }),
      { computedAt: FROZEN_AT },
    );
    expect(withoutInstitutions.deliveryCount).toBe(2);
    expect(withoutInstitutions.formulaText).toContain("기관 가산 없음");
  });

  it("가사비송 라류(느단)는 6~10회 범위라 직접 입력을 요구한다", () => {
    expect(() =>
      computeDeliveryFee(input({ caseType: "familyRuiPetition", partyCount: 1 }), {
        computedAt: FROZEN_AT,
      }),
    ).toThrow(RangeError);
    const r = computeDeliveryFee(
      input({ caseType: "familyRuiPetition", partyCount: 1, customCount: 8 }),
      { computedAt: FROZEN_AT },
    );
    expect(r.deliveryCount).toBe(8);
    expect(() =>
      computeDeliveryFee(input({ caseType: "familyRuiPetition", partyCount: 1, customCount: 11 }), {
        computedAt: FROZEN_AT,
      }),
    ).toThrow(RangeError);
  });

  it("noteKo 가 있는 사건은 formulaText 끝에 정본 단서를 붙인다", () => {
    const r = computeDeliveryFee(input({ caseType: "executionClaimAttachment", partyCount: 3 }), {
      computedAt: FROZEN_AT,
    });
    expect(r.deliveryCount).toBe(6);
    expect(r.formulaText).toContain("송달을 요하지 아니한 경우는 제외");
  });

  it("임시의 지위를 정하는 가처분은 1인당 8회로 계산한다", () => {
    // 별표 1 1. 민사 는 카합/카단 한 부호에 "가압류, 가처분사건 3회" 와
    // "임시의 지위를 정하는 가처분사건 8회" 를 별도 행으로 둔다. 회수는 당사자 1인당이다.
    const general = computeDeliveryFee(
      input({ caseType: "provisionalMeasureCollegial", partyCount: 2 }),
      { computedAt: FROZEN_AT },
    );
    expect(general.deliveryCount).toBe(6);

    const status = computeDeliveryFee(
      input({
        caseType: "provisionalMeasureCollegial",
        partyCount: 2,
        provisionalMeasureType: "provisionalStatus",
      }),
      { computedAt: FROZEN_AT },
    );
    expect(status.deliveryCount).toBe(16);
    expect(status.amount).toBe(16 * CURRENT_UNIT_WON);
    expect(status.formulaText).toContain("임시의 지위를 정하는 가처분");

    // general 을 명시해도 기본 행(3회)을 쓴다.
    expect(
      computeDeliveryFee(
        input({
          caseType: "provisionalMeasureSingle",
          partyCount: 2,
          provisionalMeasureType: "general",
        }),
        { computedAt: FROZEN_AT },
      ).deliveryCount,
    ).toBe(6);
  });

  it("보전 사건구분이 아니면 provisionalMeasureType 은 무시된다", () => {
    const r = computeDeliveryFee(
      input({
        caseType: "civilFirstInstanceCollegial",
        partyCount: 2,
        provisionalMeasureType: "provisionalStatus",
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.deliveryCount).toBe(30);
  });

  it("가사 (재)항고는 브·스 모두 5회 정액이다", () => {
    // 별표 1 6. 가사: 가사항고사건(브) 5회 / 가사재항고사건(스) 5회.
    // 종전 range 2~5 의 하한 2 는 가사특별항고(으) 2회가 흘러든 값이었다.
    const r = computeDeliveryFee(input({ caseType: "familyInterlocutoryAppeal", partyCount: 2 }), {
      computedAt: FROZEN_AT,
    });
    expect(r.deliveryCount).toBe(10);
  });

  it("행정 (재)항고는 루(3회)·무(5회) 부호이고 그 사이 값만 받는다", () => {
    // 별표 1 2. 행정: 행정항고사건(루) 3회, 행정재항고사건(무) 5회.
    // 종전 부호 "부/수" 는 부가 행정특별항고(3회), 수가 선거소송(10회) 이라 둘 다 이 행이 아니다.
    expect(CASE_TYPE_META.administrativeInterlocutoryAppeal.code).toBe("루/무");
    expect(CASE_TYPE_META.administrativeInterlocutoryAppeal.codeNumber).toBe("036/133");
    const r = computeDeliveryFee(
      input({ caseType: "administrativeInterlocutoryAppeal", partyCount: 2, customCount: 5 }),
      { computedAt: FROZEN_AT },
    );
    expect(r.deliveryCount).toBe(5);
    expect(r.formulaText).toContain("행정재항고(무) 5회");
    expect(() =>
      computeDeliveryFee(
        input({ caseType: "administrativeInterlocutoryAppeal", partyCount: 2, customCount: 2 }),
        { computedAt: FROZEN_AT },
      ),
    ).toThrow(RangeError);
  });

  it("특허 재항고는 흐(5회) 부호다", () => {
    // 별표 1 5. 특허: 특허재항고사건(흐) 5회 / 특허특별(준)항고사건(히) 3회.
    // 종전에는 히 부호에 흐의 5회가 붙어 있었다. 특별항고·준항고는 이 데이터셋이
    // 민사(그·바)·행정(부·사)·가사(으) 어디에서도 담지 않으므로 특허도 재항고만 둔다.
    expect(CASE_TYPE_META.patentInterlocutoryAppeal.code).toBe("흐");
    expect(CASE_TYPE_META.patentInterlocutoryAppeal.codeNumber).toBe("032");
    const r = computeDeliveryFee(input({ caseType: "patentInterlocutoryAppeal", partyCount: 2 }), {
      computedAt: FROZEN_AT,
    });
    expect(r.deliveryCount).toBe(10);
  });

  it("가사신청은 원칙 3회이되 가압류·가처분 이의·취소 단서 8회까지 받는다", () => {
    // 별표 1 6. 가사: 가사신청사건 3회, 단 가압류·가처분에 대한 이의·취소 사건은 8회.
    const r = computeDeliveryFee(
      input({ caseType: "familyApplication", partyCount: 2, customCount: 8 }),
      { computedAt: FROZEN_AT },
    );
    expect(r.deliveryCount).toBe(8);
    expect(r.formulaText).toContain("이의·취소");
    expect(() =>
      computeDeliveryFee(input({ caseType: "familyApplication", partyCount: 2, customCount: 9 }), {
        computedAt: FROZEN_AT,
      }),
    ).toThrow(RangeError);
  });

  it("특허신청사건(카허)은 신청인·상대방 1인당 5회분이다", () => {
    // 재일 87-4 별표 1 (재판예규 제1950호, 시행 2026-03-01) 5. 특허:
    // 특허신청사건(카허) 5회, 수송달자 신청인·상대방. 단서 없는 정액이라 range 가 아니다.
    const r = computeDeliveryFee(input({ caseType: "patentApplication", partyCount: 2 }), {
      computedAt: FROZEN_AT,
    });
    expect(r.deliveryCount).toBe(10);
    expect(r.amount).toBe(10 * CURRENT_UNIT_WON);
    expect(r.formulaText).toContain("위헌법률심판제청사건은 제외");
  });

  it("확장 사건구분 28종이 전부 매트릭스에 있고 회수 산식이 검증된다", () => {
    const ds = loadDeliveryDataset();
    const added = [
      "executionAssetDisclosure",
      "executionDebtorRegister",
      "executionAssetInquiry",
      "executionRealEstateAuction",
      "executionClaimAttachment",
      "executionOther",
      "rehabilitationIndividual",
      "bankruptcyIndividual",
      "bankruptcyDischarge",
      "rehabilitationCorporate",
      "insolvencyClaimDetermination",
      "familyRuiPetition",
      "familyMaPetition",
      "familyAppeal",
      "familySupremeAppeal",
      "familyMediation",
      "familyInterlocutoryAppeal",
      "familyApplication",
      "administrativeAppeal",
      "administrativeSupremeAppeal",
      "administrativeInterlocutoryAppeal",
      "administrativeApplication",
      "patentFirstInstance",
      "patentSupremeAppeal",
      "patentInterlocutoryAppeal",
      "patentApplication",
      "fineObjection",
      "nonContentious",
    ] as const;
    expect(added).toHaveLength(28);
    for (const caseType of added) {
      expect(() => getDeliveryCount(ds, caseType), caseType).not.toThrow();
    }
  });
});
