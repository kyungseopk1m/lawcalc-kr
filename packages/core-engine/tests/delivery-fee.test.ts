import { describe, expect, it } from "vitest";

import {
  computeDeliveryFee,
  deliveryDatasetVersionTag,
  getDeliveryCount,
  getDeliveryUnitPriceAt,
  loadDeliveryDataset,
  type DeliveryDataset,
  type DeliveryFeeInput,
} from "../src";

const FROZEN_AT = "2026-05-11T00:00:00.000Z";

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
    expect(ds.version).toBe("1.1.0");
    expect(ds.unitPriceHistory).toHaveLength(4);
    expect(ds.unitPriceHistory[0]!.unitPriceWon).toBe(5500);
    expect(ds.countMatrix).toHaveLength(13);
    expect(ds.unverifiedMatrix).toHaveLength(0);
  });

  it("deliveryDatasetVersionTag 는 delivery/v1.1.0", () => {
    expect(deliveryDatasetVersionTag(loadDeliveryDataset())).toBe("delivery/v1.1.0");
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

describe("getDeliveryUnitPriceAt / 시기별 단가 (4 슬라이스)", () => {
  const ds = loadDeliveryDataset();

  it("filingDate 미지정 → 현행 단가 (5,500원, 2025-06-01)", () => {
    const entry = getDeliveryUnitPriceAt(ds);
    expect(entry.unitPriceWon).toBe(5500);
    expect(entry.effectiveFrom).toBe("2025-06-01");
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

  it("민사가압류 합의 (카합) — simplePerParty(3) (easylaw cross-validated)", () => {
    const entry = getDeliveryCount(ds, "provisionalMeasureCollegial");
    expect(entry.formula).toEqual({ kind: "simplePerParty", countPerParty: 3 });
  });

  it("민사가압류 단독 (카단) — simplePerParty(3)", () => {
    const entry = getDeliveryCount(ds, "provisionalMeasureSingle");
    expect(entry.formula).toEqual({ kind: "simplePerParty", countPerParty: 3 });
  });

  it("paymentOrder (차) → simplePerParty 6회 (재일 87-4 별표 1 정본)", () => {
    const entry = getDeliveryCount(ds, "paymentOrder");
    expect(entry.formula).toEqual({ kind: "simplePerParty", countPerParty: 6 });
  });
});

describe("computeDeliveryFee / 산식 분기 + 시기별 단가", () => {
  it("민사 제1심 합의 (가합), 당사자 2명, 현행 단가 = 2 × 15 × 5,500 = 165,000원", () => {
    const r = computeDeliveryFee(
      input({ caseType: "civilFirstInstanceCollegial", partyCount: 2 }),
      {
        computedAt: FROZEN_AT,
      },
    );
    expect(r.deliveryCount).toBe(30);
    expect(r.perDeliveryUnitPriceWon).toBe(5500);
    expect(r.amount).toBe(165_000);
    expect(r.dataVersion).toBe("delivery/v1.1.0");
    expect(r.computedAt).toBe(FROZEN_AT);
  });

  it("민사 항소 (나), 당사자 3명, 현행 = 3 × 12 × 5,500 = 198,000원", () => {
    const r = computeDeliveryFee(input({ caseType: "civilAppeal", partyCount: 3 }), {
      computedAt: FROZEN_AT,
    });
    expect(r.deliveryCount).toBe(36);
    expect(r.amount).toBe(198_000);
  });

  it("민사 (재)항고 (라/마), 당사자 1명 = 1 × 5 × 5,500 = 27,500원", () => {
    const r = computeDeliveryFee(input({ caseType: "civilInterlocutoryAppeal", partyCount: 1 }), {
      computedAt: FROZEN_AT,
    });
    expect(r.deliveryCount).toBe(5);
    expect(r.amount).toBe(27_500);
  });

  it("민사가압류 합의 (카합), 당사자 2명 = 2 × 3 × 5,500 = 33,000원", () => {
    const r = computeDeliveryFee(
      input({ caseType: "provisionalMeasureCollegial", partyCount: 2 }),
      {
        computedAt: FROZEN_AT,
      },
    );
    expect(r.deliveryCount).toBe(6);
    expect(r.amount).toBe(33_000);
  });

  it("행정 제1심 (구), 당사자 2명 = 2 × 10 × 5,500 = 110,000원", () => {
    const r = computeDeliveryFee(
      input({ caseType: "administrativeFirstInstance", partyCount: 2 }),
      {
        computedAt: FROZEN_AT,
      },
    );
    expect(r.deliveryCount).toBe(20);
    expect(r.amount).toBe(110_000);
  });

  it("paymentOrder (차), 당사자 2명 (채권자·채무자) = 2 × 6 × 5,500 = 66,000원", () => {
    const r = computeDeliveryFee(input({ caseType: "paymentOrder", partyCount: 2 }), {
      computedAt: FROZEN_AT,
    });
    expect(r.deliveryCount).toBe(12);
    expect(r.perDeliveryUnitPriceWon).toBe(5500);
    expect(r.amount).toBe(66_000);
    expect(r.dataVersion).toBe("delivery/v1.1.0");
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
    expect(r.amount).toBe(50 * 5500);
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
  it("default 호출 → bundled dataset 사용 (5,500원)", () => {
    const r = computeDeliveryFee(input({ partyCount: 1 }), { computedAt: FROZEN_AT });
    expect(r.perDeliveryUnitPriceWon).toBe(5500);
    expect(r.dataVersion).toBe("delivery/v1.1.0");
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
    expect(r.formulaText).toContain("회당 단가 5,500원");
    expect(r.formulaText).toContain("165,000원");
  });

  it("filingDate 지정 시 formulaText 에 시기별 메타 포함", () => {
    const r = computeDeliveryFee(
      input({ caseType: "civilFirstInstanceCollegial", partyCount: 1, filingDate: "2020-06-30" }),
      { computedAt: FROZEN_AT },
    );
    expect(r.formulaText).toContain("2019-05-01 시행 슬라이스");
    expect(r.formulaText).toContain("filingDate 2020-06-30");
  });

  it("override 사용 시 formulaText 에 override 메타 포함", () => {
    const r = computeDeliveryFee(
      input({
        caseType: "civilFirstInstanceCollegial",
        partyCount: 1,
        perDeliveryUnitPriceWon: 9000,
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.formulaText).toContain("입력 override");
  });
});
