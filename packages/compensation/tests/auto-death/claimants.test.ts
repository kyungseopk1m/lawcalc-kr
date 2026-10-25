import { describe, expect, it } from "vitest";

import { computeCompensation } from "../../src/auto-injury/compute";
import type { CompensationInput } from "../../src/auto-injury/types";
import { computeCompensationDeath } from "../../src/auto-death/compute";
import type { CompensationAutoDeathInput } from "../../src/auto-death/types";
import vkC2 from "../golden/auto-death/case-comp-027-vk-c2-claimants.json";
import vkB3 from "../golden/auto-injury/case-comp-025-vk-b3-claimants-won.json";

const NOW = () => new Date("2026-05-18T00:00:00.000Z");

// 원고별 귀속 경로도 비율공제·지급치료비는 재산상 손해 한도에서만 뺀다 (R2-a 결정 9, settle 과 같은 규칙).
describe("사망 원고별 귀속 - 공제 한도", () => {
  const input = {
    ...(vkC2.input as unknown as CompensationAutoDeathInput),
    solatiumWon: 100_000_000,
    deductions: { ratio: [], absolute: [], paidTreatment: [{ amount: 9_000_000_000 }] },
  } as CompensationAutoDeathInput;

  it("지급치료비가 재산상 손해를 넘어도 망인 위자료는 깎지 않는다", () => {
    const r = computeCompensationDeath(input, { now: NOW });
    // 재산상 손해(장례비 제외) 218,481,120 은 지급치료비 공제로 0, 망인 위자료 1억이 상속대상.
    expect(r.estateWon).toBe(100_000_000);
    const [spouse, child] = r.inheritanceShares ?? [];
    expect(spouse?.inheritedSolatiumWon).toBe(60_000_000);
    expect(spouse?.amountWon).toBe(64_500_000); // + 장례비 5,000,000 × 0.9
    expect(child?.amountWon).toBe(40_000_000);
    expect(r.finalWon).toBe(104_500_000);
    // 버려진 지급치료비 공제분이 결과에 드러난다 (화면·출력의 초과 안내 근거).
    expect(r.deductions.propertyOnlyDiscardedWon ?? 0).toBeGreaterThan(0);
  });

  it("원고별 귀속 없이 계산해도 망인 위자료 1억과 장례비 손해가 남는다", () => {
    const plain: CompensationAutoDeathInput = { ...input };
    delete plain.claimants;
    // 2026-10-25 장례비 완충 제거: 지급치료비가 장례비 손해 4,500,000 을 깎지 않는다 (종전 100,000,000).
    expect(computeCompensationDeath(plain, { now: NOW }).finalWon).toBe(104_500_000);
  });
});

// 수급권자형 산재: 원고별 경로도 상속인별로 유족급여를 먼저 빼고 과실상계·공제를 한다
// (2008다13104, 2021다241618). 장례비 0·고유 위자료 0·배우자 단독이면 원고별 귀속 유무와
// 무관하게 같은 금액이어야 한다 (독립 검증 반례 A·C, 2026-10-25).
describe("사망 원고별 귀속 - 수급권자형 유족급여 순서", () => {
  const base = (over: Partial<CompensationAutoDeathInput>): CompensationAutoDeathInput => ({
    mode: "death",
    accidentType: "industrial",
    base: { birthDate: "1980-05-10", accidentDate: "2025-03-01", sex: "male" },
    lostIncome: { occupation: "보통인부" },
    funeralExpenseWon: 0,
    faultRatio: 0,
    heirs: {
      decedent: { deceasedAt: "2025-03-01" },
      spouse: { name: "배우자", alive: true },
      linealDescendants: [],
    },
    ...over,
  });
  const both = (input: CompensationAutoDeathInput) => {
    const plain = computeCompensationDeath(input, { now: NOW });
    const split = computeCompensationDeath(
      { ...input, claimants: { finalRounding: "hundred" } },
      { now: NOW },
    );
    return { plain, split };
  };

  it("반례 A: 유족급여가 일실수입을 다 메우면 선급금은 망인 위자료를 깎는다", () => {
    const { plain, split } = both(
      base({
        solatiumWon: 100_000_000,
        industrialInsurance: {
          recipients: [{ heirName: "배우자", survivorBenefitWon: 9_000_000_000 }],
        },
        deductions: { ratio: [], paidTreatment: [], absolute: [{ amount: 9_000_000_000 }] },
      }),
    );
    expect(plain.finalWon).toBe(0);
    expect(split.finalWon).toBe(0);
    expect(split.inheritanceShares?.[0]?.inheritedSolatiumWon).toBe(0);
  });

  it("반례 C: 구 비율공제는 유족급여를 뺀 뒤의 금액에 곱한다", () => {
    const lostIncome = computeCompensationDeath(base({ solatiumWon: 0 }), {
      now: NOW,
    }).lostIncomeSubtotalWon;
    const half = Math.floor(lostIncome / 2);
    const { plain, split } = both(
      base({
        solatiumWon: 0,
        industrialInsurance: { recipients: [{ heirName: "배우자", survivorBenefitWon: half }] },
        deductions: { ratio: [], paidTreatment: [], absolute: [], legacyRatio: [{ ratio: 0.5 }] },
      }),
    );
    expect(plain.finalWon).toBeGreaterThan(0);
    expect(split.finalWon).toBe(plain.finalWon);
  });
});

// 2026-10-25 결정 2: 원고별 귀속이 없어도 공제 한도는 장례비 뺀 재산상 손해다 (독립 검증 반례 E).
describe("사망 - 장례비 완충 제거", () => {
  const e = (over: Partial<CompensationAutoDeathInput>): CompensationAutoDeathInput => ({
    mode: "death",
    base: { birthDate: "1980-05-10", accidentDate: "2025-03-01", sex: "male" },
    lostIncome: { directWageWon: 100_000 },
    funeralExpenseWon: 5_000_000,
    faultRatio: 0,
    heirs: {
      decedent: { deceasedAt: "2025-03-01" },
      spouse: { name: "배우자", alive: true },
      linealDescendants: [],
    },
    ...over,
  });
  const lostIncome = computeCompensationDeath(e({}), { now: NOW }).lostIncomeSubtotalWon;

  it("반례 E: 전액공제 = 일실수입 + 1원이면 장례비가 아니라 망인 위자료가 1원 줄어든다", () => {
    const input = e({
      solatiumWon: 100_000_000,
      deductions: { absolute: [{ amount: lostIncome + 1 }] },
    });
    const plain = computeCompensationDeath(input, { now: NOW });
    // 99,999,999 + 5,000,000 = 104,999,999 → 100원 미만 버림 (종전에도 104,999,900, 장례비가 1원 줄었다).
    expect(plain.finalWon).toBe(104_999_900);
    expect(plain.deductions).toMatchObject({
      afterWon: 4_999_999,
      solatiumReducedWon: 1,
      absoluteExcessDroppedWon: 0,
    });
    expect(plain.deductions.roundingWon).toBeUndefined();
    const split = computeCompensationDeath({ ...input, claimants: {} }, { now: NOW });
    expect(split.finalWon).toBe(104_999_999);
  });

  it("위자료가 없으면 전액공제 초과분은 버리고 장례비 손해 500만 원은 남는다 (종전 400만 원)", () => {
    const r = computeCompensationDeath(
      e({ deductions: { absolute: [{ amount: lostIncome + 1_000_000 }] } }),
      { now: NOW },
    );
    expect(r.finalWon).toBe(5_000_000);
    expect(r.deductions).toMatchObject({
      afterWon: 4_000_000,
      solatiumReducedWon: 0,
      absoluteExcessDroppedWon: 1_000_000,
    });
  });

  it("초과가 없으면 키가 없고 금액은 종전 식(과실상계 후 총액 - 공제 + 위자료)과 같다", () => {
    const r = computeCompensationDeath(
      e({
        faultRatio: 0.3,
        solatiumWon: 1_000_000,
        deductions: { absolute: [{ amount: 1_234_567 }] },
      }),
      { now: NOW },
    );
    expect(r.deductions.solatiumReducedWon).toBeUndefined();
    expect(r.finalWon).toBe(
      Math.floor((r.faultOffset.afterWon - 1_234_567 + 1_000_000) / 100) * 100,
    );
  });
});

// 2026-10-25 결정 1·3: 보험약관 지급기준이면 고유 위자료에도 과실을 곱하고, 상속인이 아닌 유족 행을 둔다.
describe("고유 위자료 - 약관 기준 과실 적용과 상속인 아닌 유족", () => {
  const claimants = {
    funeralPayer: "배우자",
    ownSolatium: [{ heirName: "자녀", solatiumWon: 10_000_000 }],
    otherClaimants: [{ name: "망인의 모", solatiumWon: 3_333_333 }],
  };
  const death = (over: Partial<CompensationAutoDeathInput>): CompensationAutoDeathInput => ({
    ...(vkC2.input as unknown as CompensationAutoDeathInput),
    faultRatio: 0.3,
    claimants,
    ...over,
  });

  it("판결 방식: 고유 위자료·유족 위자료에 과실을 곱하지 않고 finalWon 에 더한다", () => {
    const r = computeCompensationDeath(death({}), { now: NOW });
    expect(r.inheritanceShares?.[1]?.ownSolatiumWon).toBe(10_000_000);
    expect(r.otherClaimants).toEqual([
      { name: "망인의 모", solatiumWon: 3_333_333, amountWon: 3_333_333 },
    ]);
    const shares = (r.inheritanceShares ?? []).reduce((a, s) => a + s.amountWon, 0);
    expect(r.finalWon).toBe(shares + 3_333_333);
  });

  it("약관 기준: floor(위자료 × 0.7), 100원 절사도 유족 행에 적용", () => {
    const r = computeCompensationDeath(
      death({ applyFaultToSolatium: true, claimants: { ...claimants, finalRounding: "hundred" } }),
      { now: NOW },
    );
    expect(r.inheritanceShares?.[1]?.ownSolatiumWon).toBe(7_000_000);
    // 3,333,333 × 0.7 = 2,333,333.1 → 2,333,333 → 100원 미만 버림 2,333,300.
    expect(r.otherClaimants?.[0]?.amountWon).toBe(2_333_300);
  });

  it("키가 없으면 결과에 otherClaimants 가 없다", () => {
    const r = computeCompensationDeath(vkC2.input as unknown as CompensationAutoDeathInput, {
      now: NOW,
    });
    expect("otherClaimants" in r).toBe(false);
  });

  it("상속인 이름과 겹치거나 중복·빈 이름·음수면 거부한다", () => {
    const withOthers = (otherClaimants: { name: string; solatiumWon: number }[]) =>
      death({ claimants: { otherClaimants } });
    expect(() =>
      computeCompensationDeath(withOthers([{ name: "배우자", solatiumWon: 1 }])),
    ).toThrow(/상속인 이름과 같습니다/);
    expect(() =>
      computeCompensationDeath(
        withOthers([
          { name: "모", solatiumWon: 1 },
          { name: "모", solatiumWon: 1 },
        ]),
      ),
    ).toThrow(/중복/);
    expect(() =>
      computeCompensationDeath(withOthers([{ name: " 배우자 ", solatiumWon: 1 }])),
    ).toThrow(/상속인 이름과 같습니다/);
    expect(() =>
      computeCompensationDeath(
        withOthers([
          { name: "모", solatiumWon: 1 },
          { name: "모 ", solatiumWon: 1 },
        ]),
      ),
    ).toThrow(/중복/);
    expect(() => computeCompensationDeath(withOthers([{ name: " ", solatiumWon: 1 }]))).toThrow(
      /비어 있지 않은/,
    );
    expect(() => computeCompensationDeath(withOthers([{ name: "모", solatiumWon: -1 }]))).toThrow(
      /solatiumWon/,
    );
  });

  it("부상: 가족 위자료는 약관 기준일 때만 floor(위자료 × (1 - 과실))", () => {
    const injury = (applyFaultToSolatium: boolean): CompensationInput => ({
      ...(vkB3.input as unknown as CompensationInput),
      applyFaultToSolatium,
      claimants: { family: [{ name: "배우자", solatiumWon: 1_000_001 }] },
    });
    const off = computeCompensation(injury(false), { now: NOW });
    const on = computeCompensation(injury(true), { now: NOW });
    expect(off.claimants?.[1]?.amountWon).toBe(1_000_001);
    // 1,000,001 × 0.8 = 800,000.8 → 800,000.
    expect(on.claimants?.[1]).toMatchObject({ solatiumWon: 1_000_001, amountWon: 800_000 });
  });
});
