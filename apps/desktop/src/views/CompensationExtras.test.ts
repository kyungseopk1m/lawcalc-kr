import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";
import {
  computeCompensation,
  computeCompensationDeath,
  computeMediationInterest,
  type CompensationAutoDeathInput,
  type CompensationInput,
} from "@lawcalc-kr/compensation";

import {
  computeDocumentExport,
  computeDelayDamagesExport,
  defaultDocumentFormState,
  deathClaimantsForDirtySnapshot,
  defaultDeathClaimantsFormState,
  defaultDelayDamagesFormState,
  delayPrincipalsOf,
  LIFE_TABLE_YEARS,
  orphanedOwnSolatium,
} from "../lib/compensation-extras";
import {
  solatiumAddedAfterDeductionsWon,
  withCompensationExportWarnings,
} from "../lib/compensation-warnings";
import { migrateLcalcFile } from "../lib/lcalc-migrations";
import { parseLoadedCompensationLcalcInput, validateLcalcEnvelope } from "../lib/lcalc-validation";
import {
  applyLoadedCompensationDeathInput,
  applyLoadedCompensationInput,
  buildCompensationDeathInput,
  buildCompensationDeathLcalcFile,
  buildCompensationInput,
  buildCompensationLcalcFile,
  defaultCompensationDeathFormState,
  defaultCompensationFormState,
  formatCompensationDeathForClipboard,
  formatCompensationForClipboard,
  type CompensationDeathFormState,
  type CompensationFormState,
} from "./CompensationCalculator";

function envelope(input: Record<string, unknown>, feature: string): unknown {
  return {
    schemaVersion: "3",
    kind: "compensation",
    envelopeFeatures: [feature],
    dataVersions: {
      laborRates: "labor-rates/v1.1.0",
      lifeExpectancy: "life-expectancy/v1.1.0",
      hoffman: "hoffman/v1.0.0",
      leibniz: "leibniz/v1.0.0",
    },
    payload: {
      appVersion: "0.12.2",
      createdAt: "2026-10-01T00:00:00.000Z",
      input,
      disclaimer: STANDARD_DISCLAIMER,
    },
  };
}

/** 화면 열기와 같은 경로: 마이그레이션 → 검증 → 파싱. */
function reopen(file: unknown) {
  const migrated = migrateLcalcFile(file);
  validateLcalcEnvelope(migrated);
  return parseLoadedCompensationLcalcInput(migrated).input;
}

const injuryBase = {
  birthDate: "1990-05-10",
  accidentDate: "2022-03-01",
  treatmentEndDate: "2022-03-01",
  sex: "male",
  retirementAge: 65,
  legalRatePreset: "civil",
  calculationDate: "2026-10-01",
  laborRateEffectiveRule: "survey",
};

const deathBase = {
  birthDate: "1980-05-10",
  accidentDate: "2022-03-01",
  sex: "male",
  retirementAge: 65,
  calculationDate: "2026-10-01",
  laborRateEffectiveRule: "survey",
};

describe("compensation@5 파일은 금액 그대로 열린다 (새 키 없음 = 종전 계산)", () => {
  it("부상 @5: 절사는 꺼짐, 새 섹션은 꺼짐, 마이그레이션은 같은 참조, 최종액 동일", () => {
    const original = {
      mode: "injury",
      accidentType: "auto",
      base: injuryBase,
      lossRate: { permanent: [{ ratio: 0.3 }], hospitalizationFullLoss: true },
      lostIncome: { occupation: "보통인부", discountMethod: "hoffman", workingDaysPerMonth: 20 },
      solatiumWon: 20_000_000,
      faultRatio: 0.2,
    };
    const file = envelope(original, "compensation@5");
    expect(migrateLcalcFile(file)).toBe(file);
    const loaded = reopen(file);
    if (loaded.mode === "death") throw new Error("expected injury");
    const form = applyLoadedCompensationInput(loaded);
    expect(form.courtTruncation).toBe(false);
    expect(form.lifeExpectancy.enabled).toBe(false);
    expect(form.lostRetirement.enabled).toBe(false);
    expect(form.claimants.enabled).toBe(false);
    const rebuilt = buildCompensationInput(form);
    expect(rebuilt.base).not.toHaveProperty("courtTruncation");
    expect(rebuilt).not.toHaveProperty("lifeExpectancy");
    expect(rebuilt).not.toHaveProperty("lostRetirement");
    expect(rebuilt).not.toHaveProperty("claimants");
    const before = computeCompensation(original as unknown as CompensationInput);
    const after = computeCompensation(rebuilt);
    expect(after.finalWon).toBe(before.finalWon);
    expect(after.lostIncomeSubtotalWon).toBe(before.lostIncomeSubtotalWon);
  });

  it("사망 @5: 절사는 꺼짐으로 열려 최종액 동일", () => {
    const original = {
      mode: "death",
      accidentType: "auto",
      base: deathBase,
      lostIncome: { occupation: "보통인부", discountMethod: "hoffman", workingDaysPerMonth: 20 },
      livingCostDeductionRatio: 1 / 3,
      funeralExpenseWon: 5_000_000,
      solatiumWon: 80_000_000,
      faultRatio: 0.2,
    };
    const loaded = reopen(envelope(original, "compensation@5"));
    if (loaded.mode !== "death") throw new Error("expected death");
    const form = applyLoadedCompensationDeathInput(loaded);
    expect(form.courtTruncation).toBe(false);
    const rebuilt = buildCompensationDeathInput(form);
    expect(rebuilt.base).not.toHaveProperty("courtTruncation");
    expect(rebuilt).not.toHaveProperty("claimants");
    const before = computeCompensationDeath(original as unknown as CompensationAutoDeathInput);
    expect(computeCompensationDeath(rebuilt).finalWon).toBe(before.finalWon);
  });

  it("새 사망 계산은 절사가 기본으로 켜져 키를 명시한다", () => {
    expect(defaultCompensationDeathFormState().courtTruncation).toBe(true);
    expect(
      buildCompensationDeathInput(defaultCompensationDeathFormState()).base.courtTruncation,
    ).toBe(true);
  });
});

function injuryWithEverything(): CompensationFormState {
  return {
    ...defaultCompensationFormState(),
    birthDate: "1990-05-10",
    accidentDate: "2022-03-01",
    treatmentEndDate: "2022-03-01",
    calculationDate: "2026-10-01",
    solatiumWonText: "30000000",
    faultRatioText: "0.2",
    lifeExpectancy: {
      enabled: true,
      basis: "appraisal",
      appraisalDate: "2023-01-10",
      shorteningMethod: "remainingYears",
      shorteningText: "10",
      tableYear: String(LIFE_TABLE_YEARS[0]),
      endDateOverride: "",
    },
    lostRetirement: {
      enabled: true,
      method: "bothDiscounted",
      amountText: "",
      retirementDate: "2050-05-31",
      payAtRetirementText: "80000000",
      separationDate: "2022-03-01",
      payAtSeparationText: "10000000",
      lossRatePercentText: "30",
    },
    claimants: {
      enabled: true,
      family: [
        { uid: "f1", name: "배우자", solatiumText: "5000000" },
        { uid: "f2", name: "자녀", solatiumText: "2000000" },
      ],
      finalRounding: "hundred",
    },
  };
}

function deathWithEverything(): CompensationDeathFormState {
  return {
    ...defaultCompensationDeathFormState(),
    accidentType: "industrial",
    birthDate: "1980-05-10",
    accidentDate: "2022-03-01",
    calculationDate: "2026-10-01",
    solatiumWonText: "100000000",
    faultRatioText: "0.3",
    includeHeirs: true,
    decedent: { name: "", deceasedAt: "2022-03-01" },
    spouse: { alive: true, name: "배우자" },
    linealDescendants: [
      { id: "c1", name: "자녀", deceasedBeforeOpening: false, representatives: [] },
    ],
    lifeExpectancy: {
      enabled: true,
      basis: "accident",
      appraisalDate: "",
      shorteningMethod: "percent",
      shorteningText: "50",
      tableYear: "",
      endDateOverride: "2060-12-31",
    },
    lostRetirement: {
      enabled: true,
      method: "presentValueMinusReceived",
      amountText: "",
      retirementDate: "2040-05-31",
      payAtRetirementText: "60000000",
      separationDate: "2022-03-01",
      payAtSeparationText: "5000000",
      lossRatePercentText: "",
    },
    claimants: {
      enabled: true,
      ownSolatium: { 배우자: "20000000", 자녀: "10000000" },
      funeralPayer: "배우자",
      funeralBenefitText: "3000000",
      others: [{ uid: "o1", name: "망인의 모", solatiumText: "3000000" }],
      finalRounding: "won",
    },
  };
}

describe("compensation@6 파일은 새 키를 모두 담아 왕복된다", () => {
  it("부상: 절사·기대여명·일실퇴직금·원고별 귀속이 저장·열기 뒤 같은 입력·금액", () => {
    const input = buildCompensationInput(injuryWithEverything());
    expect(input.base.courtTruncation).toBe(true);
    expect(input.lifeExpectancy).toEqual({
      basis: "appraisal",
      appraisalDate: "2023-01-10",
      shortening: { method: "remainingYears", years: 10 },
      tableYear: LIFE_TABLE_YEARS[0],
    });
    expect(input.lostRetirement).toMatchObject({ method: "bothDiscounted", lossRatePercent: 30 });
    expect(input.claimants).toEqual({
      family: [
        { name: "배우자", solatiumWon: 5_000_000 },
        { name: "자녀", solatiumWon: 2_000_000 },
      ],
      finalRounding: "hundred",
    });
    const result = computeCompensation(input);
    const file = buildCompensationLcalcFile(input, result, "");
    expect(file.envelopeFeatures).toEqual(["compensation@6"]);
    const loaded = reopen(JSON.parse(JSON.stringify(file)));
    if (loaded.mode === "death") throw new Error("expected injury");
    const rebuilt = buildCompensationInput(applyLoadedCompensationInput(loaded));
    expect(rebuilt).toEqual(input);
    expect(computeCompensation(rebuilt).finalWon).toBe(result.finalWon);

    // 기대여명이 가동종료보다 앞서 생계비 1/3 공제 구간이 생긴다.
    expect(result.segments.some((s) => s.livingCostDeducted === true)).toBe(true);
    expect(result.claimants?.map((c) => c.role)).toEqual(["victim", "family", "family"]);
    expect(result.finalWon).toBe(result.claimants?.reduce((sum, c) => sum + c.amountWon, 0));
    // 위자료 가산 판별은 일실퇴직금을 재산상 손해로 본다.
    expect(solatiumAddedAfterDeductionsWon(result)).toBe(30_000_000);
  });

  it("사망: 절사·기대여명·일실퇴직금(상실률 100)·원고별 귀속·장의비가 저장·열기 뒤 같다", () => {
    const input = buildCompensationDeathInput(deathWithEverything());
    expect(input.base.courtTruncation).toBe(true);
    expect(input.lostRetirement).toMatchObject({ lossRatePercent: 100 });
    expect(input.claimants).toEqual({
      ownSolatium: [
        { heirName: "배우자", solatiumWon: 20_000_000 },
        { heirName: "자녀", solatiumWon: 10_000_000 },
      ],
      funeralPayer: "배우자",
      otherClaimants: [{ name: "망인의 모", solatiumWon: 3_000_000 }],
      finalRounding: "won",
    });
    expect(input.industrialInsurance).toEqual({ funeralBenefitWon: 3_000_000 });
    const result = computeCompensationDeath(input);
    const file = buildCompensationDeathLcalcFile(input, result, "");
    const loaded = reopen(JSON.parse(JSON.stringify(file)));
    if (loaded.mode !== "death") throw new Error("expected death");
    const rebuilt = buildCompensationDeathInput(applyLoadedCompensationDeathInput(loaded));
    expect(rebuilt).toEqual(input);
    expect(computeCompensationDeath(rebuilt).finalWon).toBe(result.finalWon);
    expect(result.lifeExpectancy?.endDate).toBe("2060-12-31");
    expect(result.inheritanceShares?.[0]?.funeralBenefitDeductedWon).toBeGreaterThan(0);
    // 상속인 아닌 유족 행이 저장 결과에 그대로 남고 최종액에 들어간다.
    const migrated = migrateLcalcFile(JSON.parse(JSON.stringify(file)));
    validateLcalcEnvelope(migrated);
    const savedResult = parseLoadedCompensationLcalcInput(migrated).result;
    expect(savedResult !== undefined && "otherClaimants" in savedResult).toBe(true);
    expect((savedResult as typeof result).otherClaimants).toEqual([
      { name: "망인의 모", solatiumWon: 3_000_000, amountWon: 3_000_000 },
    ]);
    const shareSum = (result.inheritanceShares ?? []).reduce((a, s) => a + s.amountWon, 0);
    expect(result.finalWon).toBe(shareSum + 3_000_000);
  });

  it("사망 원고별 귀속은 상속인 없이 계산을 막는다", () => {
    expect(() =>
      buildCompensationDeathInput({ ...deathWithEverything(), includeHeirs: false }),
    ).toThrow("원고별 귀속은 상속인을 입력해야");
  });

  it("새 키의 형식이 틀린 파일은 열지 않는다", () => {
    const valid = {
      mode: "injury",
      accidentType: "auto",
      base: injuryBase,
      lossRate: { permanent: [{ ratio: 0.3 }], hospitalizationFullLoss: true },
      lostIncome: { occupation: "보통인부", discountMethod: "hoffman", workingDaysPerMonth: 20 },
    };
    expect(() => reopen(envelope(valid, "compensation@6"))).not.toThrow();
    const bad: Record<string, unknown>[] = [
      { ...valid, base: { ...injuryBase, courtTruncation: "yes" } },
      { ...valid, lifeExpectancy: "2050-01-01" },
      { ...valid, lifeExpectancy: { tableYear: "2023" } },
      { ...valid, lostRetirement: { method: "court", amountWon: 1 } },
      { ...valid, lostRetirement: { method: "direct", amountWon: -1 } },
      { ...valid, claimants: { family: [{ name: 1, solatiumWon: 0 }] } },
      { ...valid, claimants: { finalRounding: "ten" } },
    ];
    // 사망 상속인 아닌 유족: 상속인 이름과 겹치면 열지 않는다.
    const deathValid = buildCompensationDeathInput(deathWithEverything()) as unknown as Record<
      string,
      unknown
    >;
    expect(() => reopen(envelope(deathValid, "compensation@6"))).not.toThrow();
    expect(() =>
      reopen(
        envelope(
          {
            ...deathValid,
            claimants: {
              funeralPayer: "배우자",
              otherClaimants: [{ name: "배우자", solatiumWon: 1 }],
            },
          },
          "compensation@6",
        ),
      ),
    ).toThrow("상속인 이름과 같습니다");
    for (const input of bad) {
      expect(() => reopen(envelope(input, "compensation@6"))).toThrow();
    }
    expect(() =>
      reopen(
        envelope(
          {
            mode: "death",
            accidentType: "auto",
            base: { ...deathBase, courtTruncation: 1 },
            lostIncome: { occupation: "보통인부", discountMethod: "hoffman" },
          },
          "compensation@6",
        ),
      ),
    ).toThrow();
  });
});

describe("클립보드·내보내기 새 행", () => {
  it("부상: 기대여명·일실퇴직금·생계비 공제 구간·원고별 표·지연손해금", () => {
    const result = computeCompensation(buildCompensationInput(injuryWithEverything()));
    const delayState = {
      ...defaultDelayDamagesFormState("2026-10-22"),
      enabled: true,
      judgmentDate: "2026-09-30",
    };
    const delay = computeDelayDamagesExport(delayState, "2022-03-01", delayPrincipalsOf(result));
    expect(delay.error).toBeUndefined();
    expect(delay.value?.rows.map((r) => r.label)).toEqual(["피해자 본인", "배우자", "자녀"]);
    const text = formatCompensationForClipboard(result, 0, undefined, delay.value);
    expect(text).toContain("기대여명: 기준일 2023-01-10");
    expect(text).toContain(
      `일실퇴직금: ${result.lostRetirementSubtotalWon?.toLocaleString("ko-KR")}원`,
    );
    expect(text).toContain("산식: ③");
    expect(text).toContain("\t비고");
    expect(text).toContain("생계비 1/3 공제*");
    expect(text).toContain("2020나2039267");
    expect(text).toContain("원고\t위자료\t최종액");
    expect(text).toContain("지연손해금 (손해배상액과 별도)");
    expect(text).toContain("민법이 정한 연 5%");
    expect(text).toContain("소송촉진 등에 관한 특례법이 정한 연");

    const payload = withCompensationExportWarnings(result, { courtTruncation: true }, delay.value);
    expect(payload.lifeExpectancyText).toContain("최종 여명종료일");
    expect(payload.delayDamages?.rows).toHaveLength(3);
  });

  it("새 키가 없는 결과는 클립보드에 새 줄이 없다", () => {
    const result = computeCompensation(
      buildCompensationInput({ ...defaultCompensationFormState(), courtTruncation: false }),
    );
    const text = formatCompensationForClipboard(result);
    expect(text).not.toContain("기대여명");
    expect(text).not.toContain("일실퇴직금");
    expect(text).not.toContain("비고");
    expect(text).not.toContain("지연손해금");
    const payload = withCompensationExportWarnings(result);
    expect(payload.lifeExpectancyText).toBe("");
    expect(payload).not.toHaveProperty("delayDamages");
  });

  it("사망: 절사 줄·원고별 귀속 표·지연손해금 원고별 행", () => {
    const result = computeCompensationDeath(buildCompensationDeathInput(deathWithEverything()));
    const delay = computeDelayDamagesExport(
      { ...defaultDelayDamagesFormState("2026-10-22"), enabled: true, judgmentDate: "2026-09-30" },
      "2022-03-01",
      delayPrincipalsOf(result),
    );
    const text = formatCompensationDeathForClipboard(
      result,
      { courtTruncation: true },
      delay.value,
    );
    expect(text).toContain("절사: 법원 계산 프로그램 방식 (누적 호프만 소수 4자리 버림)");
    expect(text).toContain("상속대상 금액:");
    expect(text).toContain("고유 위자료\t장례비\t장의비 공제\t최종액");
    expect(text).toContain("배우자에게 ");
    // 상속인 아닌 유족 행: 클립보드 표와 지연손해금 원금에 들어간다.
    expect(text).toContain("망인의 모 (상속인 아님)\t-\t-\t-\t3,000,000원\t-\t-\t3,000,000원");
    expect(delay.value?.rows.map((r) => r.label)).toEqual(["배우자", "자녀", "망인의 모"]);
    expect(
      withCompensationExportWarnings(result, { courtTruncation: true }).courtTruncationText,
    ).toBe("법원 계산 프로그램 방식 (누적 호프만 소수 4자리 버림)");
  });

  it("사망 원고별 표: 유족급여·장의비 공제 열은 값이 있을 때만 (화면 표와 같은 규칙)", () => {
    const state = deathWithEverything();
    const result = computeCompensationDeath(
      buildCompensationDeathInput({
        ...state,
        accidentType: "auto",
        claimants: { ...state.claimants, funeralBenefitText: "" },
      }),
    );
    const text = formatCompensationDeathForClipboard(result);
    expect(text).toContain("원고\t지분(약분)\t상속 재산상 손해");
    expect(text).toContain("고유 위자료\t장례비\t최종액");
    expect(text).not.toContain("장의비 공제");
    expect(text).not.toContain("유족급여 공제");
  });

  it("지연손해금은 선고일이 없으면 계산하지 않고 안내만 한다", () => {
    const delay = computeDelayDamagesExport(
      { ...defaultDelayDamagesFormState("2026-10-22"), enabled: true },
      "2022-03-01",
      [{ label: "최종 합계", won: 1_000_000 }],
    );
    expect(delay).toEqual({ error: "판결 선고일을 입력하세요." });
  });
});

describe("사망 고유 위자료: 상속인 이름이 바뀐 경우", () => {
  const state = {
    ...defaultDeathClaimantsFormState(),
    enabled: true,
    ownSolatium: { 배우자: "20000000", 옛이름: "10000000", 빈칸: "" },
  };

  it("목록에 없는 이름의 금액을 드러낸다", () => {
    expect(orphanedOwnSolatium(state, ["배우자", "자녀"])).toEqual([
      { name: "옛이름", won: 10_000_000 },
    ]);
  });

  it("dirty 스냅샷은 저장되는 이름만 남긴다", () => {
    expect(deathClaimantsForDirtySnapshot(state, ["배우자", "자녀"]).ownSolatium).toEqual({
      배우자: "20000000",
    });
  });

  it("dirty 스냅샷은 상속인 아닌 유족 행을 화면 키(uid) 없이 담는다", () => {
    const snapshot = deathClaimantsForDirtySnapshot(
      { ...state, others: [{ uid: "x", name: "모", solatiumText: "1000" }] },
      ["배우자"],
    );
    expect(snapshot.others).toEqual([{ name: "모", solatiumText: "1000" }]);
  });
});

describe("P4-4·P4-7 조정안·판결 이유 형식 문단과 단계마다 절사", () => {
  /** 외부 대조 B-3: B-1 + 위자료 5,000,000 + 전액공제 3,000,000, 원고별 원 단위. */
  const b3: CompensationInput = {
    base: {
      birthDate: "1980-01-01",
      accidentDate: "2010-01-01",
      treatmentEndDate: "2010-01-01",
      sex: "male",
      retirementAge: 60,
      courtTruncation: true,
    },
    lossRate: { permanent: [{ ratio: 0.3 }], hospitalizationFullLoss: false },
    lostIncome: { directWageWon: 68_965, workingDaysPerMonth: 22 },
    solatiumWon: 5_000_000,
    faultRatio: 0.2,
    deductions: { absolute: [{ amount: 3_000_000 }] },
    claimants: { finalRounding: "won" },
  };
  const mediation = { ...defaultDocumentFormState("2026-10-22"), enabled: true };

  it("조정 시나리오: 책임 80·75·85% 금액이 외부 대조값과 같고 조정일까지 이자를 더한다", () => {
    const result = computeCompensation(b3);
    const doc = computeDocumentExport(mediation, b3, result, (faultRatio) =>
      computeCompensation({ ...b3, faultRatio }),
    );
    expect(doc.error).toBeUndefined();
    const rows = doc.value!.scenarios;
    expect(rows.map((r) => [r.responsibilityPercent, r.finalWon])).toEqual([
      [80, 81_967_731],
      [75, 76_969_748],
      [85, 86_965_714],
    ]);
    for (const r of rows) {
      expect(r.totalWon).toBe(
        computeMediationInterest(r.finalWon, "2010-01-01", "2026-10-22").totalWon,
      );
    }
    const [text, table] = doc.value!.blocks;
    expect(text!.title).toBe("조정안 형식 (조정일 2026. 10. 22.)");
    expect(text!.lines).toContain("  책임 75%: 76,969,748원 (141,655,967원)");
    expect(text!.lines.join("\n")).toContain(
      "(1) 사고 후 0~360개월 360개월: 월 1,517,230원 × 30% × 219.6100 = 99,959,664원",
    );
    expect(table!.lines[0]).toBe("순번\t기간\t개월\t월 소득\t상실률\t호프만\t금액");
    expect(table!.lines.at(-1)).toBe("합계\t\t\t\t\t\t99,959,664원");
  });

  it("조정일 누락·사고일 전·가감 폭 오류는 문단 없이 오류만", () => {
    const result = computeCompensation(b3);
    const run = (patch: object) =>
      computeDocumentExport({ ...mediation, ...patch }, b3, result, () => result);
    expect(run({ mediationDate: "" }).error).toBe("조정일을 입력하세요.");
    expect(run({ mediationDate: "2009-12-31" }).error).toBe("조정일은 사고일 이후여야 합니다.");
    expect(run({ spreadPercentText: "abc" }).error).toMatch(/^가감 폭:/);
    expect(
      computeDocumentExport({ ...mediation, enabled: false }, b3, result, () => result),
    ).toEqual({});
  });

  it("판결 이유 형식: 결론·지연손해금 문구·별지 계산표, 내보내기와 클립보드에 실린다", () => {
    const result = computeCompensation(b3);
    const delay = computeDelayDamagesExport(
      { ...defaultDelayDamagesFormState("2026-10-22"), enabled: true, judgmentDate: "2026-09-30" },
      "2010-01-01",
      delayPrincipalsOf(result),
    ).value;
    const doc = computeDocumentExport(
      { ...mediation, format: "judgment" },
      b3,
      result,
      () => result,
      delay,
    ).value!;
    expect(doc.scenarios).toEqual([]);
    const lines = doc.blocks[0]!.lines.join("\n");
    expect(lines).toContain("피해자는 1980. 1. 1.생 남자이고, 2010. 1. 1. 사고를 당하였다.");
    expect(lines).toContain("가동연한은 만 60세가 되기 전날인 2039. 12. 31.까지로 보았다.");
    expect(lines).toContain("피고의 책임을 80%로 제한한다");
    expect(lines).toContain("피해자 본인 81,967,731원 (합계 81,967,731원)");
    expect(lines).toContain("지연손해금: 피해자 본인에게 81,967,731원 및 이에 대하여");
    expect(doc.blocks[1]!.title).toBe("별지 일실수입 계산표");

    const exported = withCompensationExportWarnings(result, undefined, undefined, doc.blocks);
    expect(exported.documentTexts).toEqual(doc.blocks);
    expect(withCompensationExportWarnings(result)).not.toHaveProperty("documentTexts");
    expect(formatCompensationForClipboard(result, 0, undefined, undefined, doc)).toContain(
      "판결 이유 형식 (손해배상의 범위)",
    );
  });

  it("판결 이유 형식: 과실 0% 면 책임 제한 문장을 쓰지 않는다", () => {
    const input = { ...b3, faultRatio: 0 };
    const result = computeCompensation(input);
    const doc = computeDocumentExport(
      { ...mediation, format: "judgment" },
      input,
      result,
      () => result,
    ).value!;
    const lines = doc.blocks[0]!.lines.join("\n");
    expect(lines).not.toContain("제한한다");
    expect(lines).toContain("피해자의 과실을 인정하지 않으므로 책임을 제한하지 않는다.");
  });

  it("사망 판결 이유 형식: 생계비 비율과 생계비 공제 열", () => {
    const input: CompensationAutoDeathInput = {
      mode: "death",
      base: { birthDate: "1980-01-01", accidentDate: "2010-01-01", sex: "male", retirementAge: 65 },
      lostIncome: { directWageWon: 68_965, workingDaysPerMonth: 22 },
      livingCostDeductionRatio: 1 / 3,
      funeralExpenseWon: 5_000_000,
      faultRatio: 0.1,
    };
    const result = computeCompensationDeath(input);
    const doc = computeDocumentExport({ ...mediation, format: "judgment" }, input, result, () =>
      computeCompensationDeath(input),
    ).value!;
    const lines = doc.blocks[0]!.lines.join("\n");
    expect(lines).toContain("2010. 1. 1. 사고로 사망하였다.");
    expect(lines).toContain("생계비 공제 비율: 수입의 1/3.");
    expect(lines).toContain("장례비 5,000,000원");
    expect(doc.blocks[1]!.lines[0]).toContain("생계비 공제 후");
    expect(doc.blocks[1]!.lines[1]).toContain("\t2/3\t");
  });

  it("단계마다 절사는 켰을 때만 저장하고 열면 그대로 (부상·사망)", () => {
    const injury = { ...defaultCompensationFormState(), truncateEachStep: true };
    const input = buildCompensationInput(injury);
    expect(input.base.truncateEachStep).toBe(true);
    expect(buildCompensationInput(defaultCompensationFormState()).base).not.toHaveProperty(
      "truncateEachStep",
    );
    const file = buildCompensationLcalcFile(input, computeCompensation(input), "");
    const loaded = reopen(JSON.parse(JSON.stringify(file)));
    if (loaded.mode === "death") throw new Error("expected injury");
    expect(applyLoadedCompensationInput(loaded).truncateEachStep).toBe(true);

    const death = buildCompensationDeathInput({
      ...defaultCompensationDeathFormState(),
      truncateEachStep: true,
    });
    expect(death.base.truncateEachStep).toBe(true);
    const deathFile = buildCompensationDeathLcalcFile(death, computeCompensationDeath(death), "");
    const deathLoaded = reopen(JSON.parse(JSON.stringify(deathFile)));
    if (deathLoaded.mode !== "death") throw new Error("expected death");
    expect(applyLoadedCompensationDeathInput(deathLoaded).truncateEachStep).toBe(true);
  });
});
