import { describe, expect, it } from "vitest";

import {
  STANDARD_DISCLAIMER,
  calculateInterest,
  computeAppropriation,
  computeLitigationCost,
  type AppropriationInput,
} from "@lawcalc-kr/core-engine";
import { computeCompensation, type CompensationInput } from "@lawcalc-kr/compensation";

import type { LcalcFile, LoadableLcalcFile } from "./ipc";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "./lcalc-migrations";
import {
  MAX_NOTE_LENGTH,
  parseLoadedAppropriationLcalcInput,
  parseLoadedCompensationLcalcInput,
  parseLoadedInheritanceLcalcInput,
  parseLoadedLitigationCostLcalcInput,
  parseLoadedLcalcInput,
  validateLcalcEnvelope,
} from "./lcalc-validation";

const sampleV1: Extract<LoadableLcalcFile, { schemaVersion: "1" }> = {
  schemaVersion: "1",
  appVersion: "0.1.2",
  dataVersion: "legal-rates/v1.0.0",
  createdAt: "2026-05-09T12:00:00.000Z",
  input: {
    principal: 1_000_000,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    legalRatePreset: "civil",
    options: {
      mode: "period",
      leapYear: "fixed365",
      includeFirstDay: false,
      rounding: "floor",
    },
  },
  options: {
    mode: "period",
    leapYear: "fixed365",
    includeFirstDay: false,
    rounding: "floor",
  },
  note: "legacy note",
  result: {
    principal: 1_000_000,
    segments: [],
    totalInterest: 0,
    grandTotal: 1_000_000,
    options: {
      mode: "period",
      leapYear: "fixed365",
      includeFirstDay: false,
      rounding: "floor",
    },
    dataVersion: "legal-rates/v1.0.0",
    computedAt: "2026-05-09T12:00:00.000Z",
    disclaimer: STANDARD_DISCLAIMER,
  },
  disclaimer: STANDARD_DISCLAIMER,
};

const sampleV2: Extract<LoadableLcalcFile, { schemaVersion: "2" }> = {
  schemaVersion: "2",
  kind: "interest",
  payload: {
    appVersion: "0.1.2",
    dataVersion: "legal-rates/v1.0.0",
    createdAt: "2026-05-09T12:00:00.000Z",
    input: sampleV1.input,
    options: sampleV1.options,
    result: sampleV1.result,
    note: "legacy note",
    disclaimer: STANDARD_DISCLAIMER,
  },
};

const sampleV3: LcalcFile = {
  schemaVersion: "3",
  kind: "interest",
  envelopeFeatures: ["interest@1"],
  dataVersions: { interest: "legal-rates/v1.0.0" },
  payload: sampleV2.payload,
};

describe("migrateLcalcFile", () => {
  it("wraps legacy v1 interest files into the v3 envelope with capability meta", () => {
    expect(migrateLcalcFile(sampleV1)).toEqual(sampleV3);
  });

  it("preserves v1 input, options, and note fields exactly through the chain", () => {
    const migrated = migrateLcalcFile(sampleV1);

    expect(migrated.schemaVersion).toBe(CURRENT_LCALC_SCHEMA_VERSION);
    expect(migrated.kind).toBe("interest");
    if (migrated.kind !== "interest") {
      throw new Error("unexpected kind");
    }
    expect(migrated.payload.input).toEqual(sampleV1.input);
    expect(migrated.payload.options).toEqual(sampleV1.options);
    expect(migrated.payload.note).toBe(sampleV1.note);
    expect(migrated.envelopeFeatures).toEqual(["interest@1"]);
    expect(migrated.dataVersions).toEqual({ interest: "legal-rates/v1.0.0" });
  });

  it("hoists v2 interest payload.dataVersion into v3 envelope-level dataVersions", () => {
    const migrated = migrateLcalcFile(sampleV2);

    expect(migrated.schemaVersion).toBe("3");
    expect(migrated.envelopeFeatures).toEqual(["interest@1"]);
    expect(migrated.dataVersions).toEqual({ interest: "legal-rates/v1.0.0" });
    expect(migrated.payload).toEqual(sampleV2.payload);
  });

  it("hoists v2 inheritance payload.dataVersion into v3 envelope-level dataVersions", () => {
    const v2Inheritance: Extract<LoadableLcalcFile, { schemaVersion: "2" }> = {
      schemaVersion: "2",
      kind: "inheritance",
      payload: {
        appVersion: "0.1.2",
        dataVersion: "inheritance/v1.0.0",
        createdAt: "2026-05-09T12:00:00.000Z",
        input: { decedent: { deceasedAt: "2026-01-01" } },
        disclaimer: STANDARD_DISCLAIMER,
      },
    };

    const migrated = migrateLcalcFile(v2Inheritance);

    expect(migrated.schemaVersion).toBe("3");
    expect(migrated.kind).toBe("inheritance");
    expect(migrated.envelopeFeatures).toEqual(["inheritance@1"]);
    expect(migrated.dataVersions).toEqual({ inheritance: "inheritance/v1.0.0" });
  });

  it("passes a v3 envelope through migrateLcalcFile unchanged", () => {
    expect(migrateLcalcFile(sampleV3)).toEqual(sampleV3);
  });

  it("normalizes legacy v3 litigation-cost KLAC modifier keys in-place", () => {
    const input = {
      stampDuty: {
        caseValue: 30_000_000,
        caseType: "civilFirstInstanceCollegial" as const,
        appealsLevel: "firstInstance" as const,
      },
      deliveryFee: {
        caseType: "civilFirstInstanceCollegial" as const,
        partyCount: 2,
      },
      lawyerFee: {
        caseValue: 30_000_000,
        caseType: "civilFirstInstanceCollegial" as const,
        discounts: [
          { kind: "koreaLegalAid" as const },
          { kind: "customPercent" as const, rate: 0.5 },
        ],
        koreaLegalAidAgreedFeeWon: 1_000_000,
      },
    };
    const result = computeLitigationCost(input, { computedAt: "2026-05-15T00:00:00.000Z" });
    const legacyLawyerFee = {
      caseValue: input.lawyerFee.caseValue,
      caseType: input.lawyerFee.caseType,
      discounts: input.lawyerFee.discounts,
    };
    const legacy = {
      schemaVersion: "3",
      kind: "litigation-cost",
      envelopeFeatures: ["litigation-cost@1"],
      dataVersions: {
        "stamp-duty": result.dataVersions["stamp-duty"],
        delivery: result.dataVersions.delivery,
        "lawyer-fee": "lawyer-fee/v1.0.0",
      },
      payload: {
        appVersion: "0.4.0",
        createdAt: "2026-05-15T00:00:00.000Z",
        input: {
          ...input,
          lawyerFee: {
            ...legacyLawyerFee,
            discounts: [{ kind: "klac" }, { kind: "customPercent", rate: 0.5 }],
            klacAgreedFeeWon: 1_000_000,
          },
        },
        result: {
          ...result,
          lawyerFee: {
            ...result.lawyerFee,
            appliedDiscounts: [{ kind: "klac" }, { kind: "customPercent", rate: 0.5 }],
            klacWarnings: [
              {
                caseType: "civilFirstInstanceCollegial",
                reason: "klacScopeOverridden",
                messageKo: "KLAC variant 와 다른 multiplier 의 누적은 이중 감액 위험이 있습니다",
              },
            ],
            formulaText: "KLAC (대한법률구조공단, ×0.42 default)",
          },
        },
        disclaimer: STANDARD_DISCLAIMER,
      },
    };

    const migrated = migrateLcalcFile(legacy);
    validateLcalcEnvelope(migrated);
    const loaded = parseLoadedLitigationCostLcalcInput(migrated);

    expect(loaded.input.lawyerFee.discounts).toEqual([
      { kind: "koreaLegalAid" },
      { kind: "customPercent", rate: 0.5 },
    ]);
    expect(loaded.input.lawyerFee.koreaLegalAidAgreedFeeWon).toBe(1_000_000);
    expect(loaded.result?.lawyerFee.appliedDiscounts[0]).toEqual({ kind: "koreaLegalAid" });
    expect(loaded.result?.lawyerFee.koreaLegalAidWarnings[0]?.reason).toBe(
      "koreaLegalAidScopeOverridden",
    );
    expect(loaded.result?.lawyerFee.formulaText).toBe("대한법률구조공단 (×0.42 default)");
  });

  it("rejects unsupported versions with a Korean user-facing message", () => {
    expect(() => migrateLcalcFile({ ...sampleV1, schemaVersion: "9" })).toThrow(
      "지원하지 않는 .lcalc 버전입니다: 9",
    );
  });

  it.each(["4", "99"])("rejects future schemaVersion %s", (schemaVersion) => {
    expect(() => migrateLcalcFile({ ...sampleV1, schemaVersion })).toThrow(
      `지원하지 않는 .lcalc 버전입니다: ${schemaVersion}`,
    );
  });

  it.each(["", null, undefined])("rejects unknown schemaVersion %s", (schemaVersion) => {
    expect(() => migrateLcalcFile({ ...sampleV1, schemaVersion })).toThrow(
      ".lcalc 파일 형식을 확인할 수 없습니다.",
    );
  });
});

describe("validateLcalcEnvelope", () => {
  it("rejects unknown capability ids with the capability id shown in the message", () => {
    expect(() =>
      validateLcalcEnvelope({
        schemaVersion: "3",
        kind: "industrial-accident",
        envelopeFeatures: ["industrial-accident@1"],
        dataVersions: { "industrial-accident": "industrial-accident/v1.0.0" },
        payload: {},
      }),
    ).toThrow("이 파일에는 industrial-accident@1 기능이 필요합니다.");
  });

  it("rejects malformed capability ids in envelopeFeatures", () => {
    expect(() =>
      validateLcalcEnvelope({
        schemaVersion: "3",
        kind: "interest",
        envelopeFeatures: ["interest"], // missing @{n}
        dataVersions: { interest: "legal-rates/v1.0.0" },
        payload: sampleV3.payload,
      }),
    ).toThrow(
      '.lcalc 파일의 envelopeFeatures[0] 필드는 capability id 형식이어야 합니다 (예: "interest@1").',
    );
  });

  it("rejects an empty envelopeFeatures array", () => {
    expect(() =>
      validateLcalcEnvelope({
        schemaVersion: "3",
        kind: "interest",
        envelopeFeatures: [],
        dataVersions: { interest: "legal-rates/v1.0.0" },
        payload: sampleV3.payload,
      }),
    ).toThrow(".lcalc 파일의 envelopeFeatures 필드가 올바르지 않습니다.");
  });

  it("rejects a v3 envelope whose dataVersions field is missing", () => {
    expect(() =>
      validateLcalcEnvelope({
        ...sampleV3,
        dataVersions: null as unknown as Record<string, string>,
      }),
    ).toThrow(".lcalc 파일의 dataVersions 필드는 객체여야 합니다.");
  });

  it("rejects a v3 envelope whose dataVersions entry is a non-string", () => {
    expect(() =>
      validateLcalcEnvelope({
        ...sampleV3,
        dataVersions: { interest: 1 as unknown as string },
      }),
    ).toThrow('.lcalc 파일의 dataVersions["interest"] 필드는 비어 있지 않은 문자열이어야 합니다.');
  });

  it("rejects interest kind with inheritance-shaped payload", () => {
    expect(() =>
      validateLcalcEnvelope({
        schemaVersion: "3",
        kind: "interest",
        envelopeFeatures: ["interest@1"],
        dataVersions: { interest: "inheritance/v1.0.0" },
        payload: {
          appVersion: "0.1.2",
          dataVersion: "inheritance/v1.0.0",
          createdAt: "2026-05-09T12:00:00.000Z",
          input: { decedent: { deceasedAt: "2026-01-01" } },
          disclaimer: STANDARD_DISCLAIMER,
        },
      }),
    ).toThrow("payload.result");
  });

  it("rejects inheritance kind with interest-shaped payload", () => {
    expect(() =>
      validateLcalcEnvelope({
        schemaVersion: "3",
        kind: "inheritance",
        envelopeFeatures: ["inheritance@1"],
        dataVersions: { inheritance: "legal-rates/v1.0.0" },
        payload: sampleV3.payload,
      }),
    ).toThrow("payload.input.decedent");
  });

  it("round-trips a v3 interest file through JSON and parser without changing the result", () => {
    const back = JSON.parse(JSON.stringify(sampleV3)) as LcalcFile;
    validateLcalcEnvelope(back);
    const loaded = parseLoadedLcalcInput(back);

    expect(loaded.input).toEqual(sampleV1.input);
    expect(loaded.result).toEqual(sampleV1.result);
    expect(loaded.note).toBe("legacy note");
  });

  it("loads a migrated v1 golden input with the same calculated result as a v3 save", () => {
    const input = {
      ...sampleV1.input,
      principal: 10_000_000,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    };
    const result = calculateInterest(input);
    const v1: LoadableLcalcFile = { ...sampleV1, input, result };
    const v3: LcalcFile = {
      schemaVersion: "3",
      kind: "interest",
      envelopeFeatures: ["interest@1"],
      dataVersions: { interest: result.dataVersion },
      payload: {
        appVersion: "0.1.2",
        dataVersion: result.dataVersion,
        createdAt: "2026-05-09T12:00:00.000Z",
        input,
        options: input.options,
        result,
        disclaimer: STANDARD_DISCLAIMER,
      },
    };

    const migrated = migrateLcalcFile(v1);
    validateLcalcEnvelope(migrated);
    validateLcalcEnvelope(v3);

    expect(parseLoadedLcalcInput(migrated).result.totalInterest).toBe(
      parseLoadedLcalcInput(v3).result.totalInterest,
    );
  });

  it("parses a v3 inheritance file for the inheritance tab", () => {
    const inheritanceFile: LcalcFile = {
      schemaVersion: "3",
      kind: "inheritance",
      envelopeFeatures: ["inheritance@1"],
      dataVersions: { inheritance: "inheritance/v1.0.0" },
      payload: {
        appVersion: "0.1.2",
        dataVersion: "inheritance/v1.0.0",
        createdAt: "2026-05-09T12:00:00.000Z",
        input: {
          decedent: { deceasedAt: "2026-01-01" },
          spouse: { alive: true, name: "배우자" },
          linealDescendants: [{ name: "자녀1", deceasedBeforeOpening: false }],
        },
        result: {
          decedent: { deceasedAt: "2026-01-01" },
          shares: [
            {
              name: "배우자",
              numerator: 3,
              denominator: 5,
              rawNumerator: 3,
              rawDenominator: 5,
            },
            {
              name: "자녀1",
              numerator: 2,
              denominator: 5,
              rawNumerator: 2,
              rawDenominator: 5,
            },
          ],
          disclaimer: STANDARD_DISCLAIMER,
          dataVersion: "inheritance/v1.0.0",
          computedAt: "2026-05-09T12:00:00.000Z",
        },
        note: "inheritance note",
        disclaimer: STANDARD_DISCLAIMER,
      },
    };

    validateLcalcEnvelope(inheritanceFile);
    const loaded = parseLoadedInheritanceLcalcInput(inheritanceFile);
    expect(loaded.input.spouse?.name).toBe("배우자");
    expect(loaded.result?.shares).toHaveLength(2);
    expect(loaded.note).toBe("inheritance note");
  });

  it("rejects an interest file whose note exceeds the bounded length", () => {
    const oversized: LcalcFile = {
      ...sampleV3,
      payload: {
        ...sampleV3.payload,
        note: "가".repeat(MAX_NOTE_LENGTH + 1),
      },
    };
    expect(() => validateLcalcEnvelope(oversized)).toThrow(
      ".lcalc 파일의 payload.note 필드가 너무 깁니다.",
    );
  });

  it("accepts an interest file whose note is exactly the bounded length", () => {
    const onTheLimit: LcalcFile = {
      ...sampleV3,
      payload: {
        ...sampleV3.payload,
        note: "가".repeat(MAX_NOTE_LENGTH),
      },
    };
    expect(() => validateLcalcEnvelope(onTheLimit)).not.toThrow();
    const loaded = parseLoadedLcalcInput(onTheLimit);
    expect(loaded.note?.length).toBe(MAX_NOTE_LENGTH);
  });

  it("rejects an inheritance file whose note exceeds the bounded length", () => {
    const inheritanceFile: LcalcFile = {
      schemaVersion: "3",
      kind: "inheritance",
      envelopeFeatures: ["inheritance@1"],
      dataVersions: { inheritance: "inheritance/v1.0.0" },
      payload: {
        appVersion: "0.1.2",
        dataVersion: "inheritance/v1.0.0",
        createdAt: "2026-05-09T12:00:00.000Z",
        input: { decedent: { deceasedAt: "2026-01-01" } },
        note: "x".repeat(MAX_NOTE_LENGTH + 1),
        disclaimer: STANDARD_DISCLAIMER,
      },
    };
    expect(() => validateLcalcEnvelope(inheritanceFile)).toThrow(
      ".lcalc 파일의 payload.note 필드가 너무 깁니다.",
    );
  });

  it("parses a v3 litigation-cost file with three dataVersions", () => {
    const input = {
      stampDuty: {
        caseValue: 30_000_000,
        caseType: "civilFirstInstanceSingle" as const,
        appealsLevel: "firstInstance" as const,
      },
      deliveryFee: {
        caseType: "civilFirstInstanceSingle" as const,
        partyCount: 2,
      },
      lawyerFee: {
        caseValue: 30_000_000,
        caseType: "civilFirstInstanceSingle" as const,
        discounts: [],
      },
      distribution: { mode: "equal" as const, partyCount: 2 },
    };
    const result = computeLitigationCost(input, { computedAt: "2026-05-11T12:00:00.000Z" });
    const litigationFile: LcalcFile = {
      schemaVersion: "3",
      kind: "litigation-cost",
      envelopeFeatures: ["litigation-cost@1"],
      dataVersions: {
        "stamp-duty": result.dataVersions["stamp-duty"]!,
        delivery: result.dataVersions.delivery!,
        "lawyer-fee": result.dataVersions["lawyer-fee"]!,
      },
      payload: {
        appVersion: "0.3.0",
        createdAt: "2026-05-11T12:00:00.000Z",
        input,
        result,
        note: "litigation note",
        disclaimer: STANDARD_DISCLAIMER,
      },
    };

    validateLcalcEnvelope(litigationFile);
    const loaded = parseLoadedLitigationCostLcalcInput(litigationFile);
    expect(loaded.input.distribution?.mode).toBe("equal");
    expect(loaded.result?.totalAmount).toBe(3_060_000);
    expect(loaded.note).toBe("litigation note");
  });

  it("round-trips a paymentOrder (변호사보수 산입 외) litigation-cost file without throwing on load", () => {
    const input = {
      stampDuty: {
        caseValue: 30_000_000,
        caseType: "paymentOrder" as const,
        appealsLevel: "firstInstance" as const,
        isPaymentOrder: true,
      },
      deliveryFee: {
        caseType: "paymentOrder" as const,
        partyCount: 2,
      },
      lawyerFee: {
        caseValue: 30_000_000,
        caseType: "paymentOrder" as const,
        discounts: [],
      },
      distribution: { mode: "equal" as const, partyCount: 2 },
    };
    const result = computeLitigationCost(input, { computedAt: "2026-05-12T12:00:00.000Z" });
    const litigationFile: LcalcFile = {
      schemaVersion: "3",
      kind: "litigation-cost",
      envelopeFeatures: ["litigation-cost@1"],
      dataVersions: {
        "stamp-duty": result.dataVersions["stamp-duty"]!,
        delivery: result.dataVersions.delivery!,
        "lawyer-fee": result.dataVersions["lawyer-fee"]!,
      },
      payload: {
        appVersion: "0.3.1",
        createdAt: "2026-05-12T12:00:00.000Z",
        input,
        result,
        disclaimer: STANDARD_DISCLAIMER,
      },
    };

    validateLcalcEnvelope(litigationFile);
    // 핵심 회귀 가드: validateLawyerFeeInput 가 paymentOrder 에서 throw 하지 않도록 분기 처리되어 round-trip 정상 동작.
    const loaded = parseLoadedLitigationCostLcalcInput(litigationFile);
    expect(loaded.input.lawyerFee.caseType).toBe("paymentOrder");
    expect(loaded.input.lawyerFee.discounts).toEqual([]);
    expect(loaded.result?.lawyerFee.amount).toBe(0);
    expect(loaded.result?.deliveryFee.amount).toBe(66_000);
  });

  it("rejects a litigation-cost file missing a required dataVersion", () => {
    const input = {
      stampDuty: {
        caseValue: 30_000_000,
        caseType: "civilFirstInstanceSingle" as const,
        appealsLevel: "firstInstance" as const,
      },
      deliveryFee: {
        caseType: "civilFirstInstanceSingle" as const,
        partyCount: 2,
      },
      lawyerFee: {
        caseValue: 30_000_000,
        caseType: "civilFirstInstanceSingle" as const,
        discounts: [],
      },
    };
    const result = computeLitigationCost(input, { computedAt: "2026-05-11T12:00:00.000Z" });
    const litigationFile: LcalcFile = {
      schemaVersion: "3",
      kind: "litigation-cost",
      envelopeFeatures: ["litigation-cost@1"],
      dataVersions: {
        "stamp-duty": result.dataVersions["stamp-duty"]!,
        delivery: result.dataVersions.delivery!,
      },
      payload: {
        appVersion: "0.3.0",
        createdAt: "2026-05-11T12:00:00.000Z",
        input,
        result,
        disclaimer: STANDARD_DISCLAIMER,
      },
    };

    expect(() => validateLcalcEnvelope(litigationFile)).toThrow(
      '.lcalc 파일의 dataVersions["lawyer-fee"] 필드는 비어 있지 않은 문자열이어야 합니다.',
    );
  });
});

describe("v3 appropriation envelope", () => {
  function buildAppropriationFile(): LcalcFile {
    const input: AppropriationInput = {
      claims: [
        {
          id: "loan-1",
          name: "대여금A",
          costBalance: 1000,
          interestBalance: 2000,
          principalBalance: 10000,
          dueAt: "2025-01-01",
        },
      ],
      payment: {
        amount: 5000,
        allocation: {
          type: "debtorDesignation",
          targets: [{ claimId: "loan-1", amount: 5000 }],
        },
      },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    return {
      schemaVersion: "3",
      kind: "appropriation",
      envelopeFeatures: ["appropriation@1"],
      dataVersions: { appropriation: result.dataVersion },
      payload: {
        appVersion: "0.4.0",
        createdAt: "2026-05-15T00:00:00.000Z",
        input,
        result,
        disclaimer: STANDARD_DISCLAIMER,
      },
    };
  }

  it("envelope validation 통과 + parseLoadedAppropriationLcalcInput round-trip", () => {
    const file = buildAppropriationFile();
    expect(() => validateLcalcEnvelope(file)).not.toThrow();
    const loaded = parseLoadedAppropriationLcalcInput(file);
    expect(loaded.input.claims).toHaveLength(1);
    expect(loaded.input.claims[0]?.id).toBe("loan-1");
    expect(loaded.input.payment.amount).toBe(5000);
    expect(loaded.input.payment.allocation.type).toBe("debtorDesignation");
    expect(loaded.result?.dataVersion).toBe("appropriation/policy-v1");
    expect(loaded.result?.payment.appliedAmount).toBe(5000);
  });

  it("rejects an unknown capability id (industrial-accident@1)", () => {
    const file = {
      schemaVersion: "3" as const,
      kind: "industrial-accident",
      envelopeFeatures: ["industrial-accident@1"],
      dataVersions: { "industrial-accident": "industrial-accident/v1.0.0" },
      payload: {
        appVersion: "0.7.0",
        createdAt: "2027-01-01T00:00:00.000Z",
        input: {},
        disclaimer: STANDARD_DISCLAIMER,
      },
    };
    expect(() => validateLcalcEnvelope(file as never)).toThrow(
      /industrial-accident@1 기능이 필요합니다/,
    );
  });
});

describe("v3 compensation envelope", () => {
  function buildCompensationFile(): LcalcFile {
    const input: CompensationInput = {
      base: {
        birthDate: "1996-01-01",
        accidentDate: "2026-01-01",
        treatmentEndDate: "2026-01-01",
        sex: "male",
        retirementAge: 60,
        legalRatePreset: "civil",
      },
      lossRate: {
        permanent: [{ department: "정형외과", ratio: 0.3 }],
      },
      lostIncome: {
        occupation: "보통인부",
        discountMethod: "hoffman",
        workingDaysPerMonth: 22,
      },
    };
    const result = computeCompensation(input);
    return {
      schemaVersion: "3",
      kind: "compensation",
      envelopeFeatures: ["compensation@1"],
      dataVersions: {
        laborRates: result.dataVersions.laborRates,
        lifeExpectancy: result.dataVersions.lifeExpectancy,
        hoffman: result.dataVersions.hoffman,
        leibniz: result.dataVersions.leibniz,
      },
      payload: {
        appVersion: "0.5.0",
        createdAt: "2026-05-18T00:00:00.000Z",
        input,
        result,
        note: "compensation note",
        disclaimer: STANDARD_DISCLAIMER,
      },
    };
  }

  it("envelope validation 통과 + parseLoadedCompensationLcalcInput round-trip", () => {
    const file = buildCompensationFile();
    expect(() => validateLcalcEnvelope(file)).not.toThrow();
    const loaded = parseLoadedCompensationLcalcInput(file);
    if (loaded.input.mode === "death") {
      throw new Error("expected injury input");
    }
    expect(loaded.input.base.birthDate).toBe("1996-01-01");
    expect(loaded.input.lossRate.permanent?.[0]?.ratio).toBe(0.3);
    expect(loaded.input.lostIncome.occupation).toBe("보통인부");
    expect(loaded.note).toBe("compensation note");
    expect(loaded.result?.finalWon).toBeGreaterThan(0);
    expect(loaded.result?.dataVersions.laborRates).toBe("labor-rates/v1.0.0");
  });

  it("rejects a compensation envelope missing a required dataVersion", () => {
    const file = buildCompensationFile();
    const broken: LcalcFile = {
      ...file,
      dataVersions: { laborRates: file.dataVersions.laborRates! },
    };
    expect(() => validateLcalcEnvelope(broken)).toThrow(
      '.lcalc 파일의 dataVersions["lifeExpectancy"] 필드는 비어 있지 않은 문자열이어야 합니다.',
    );
  });

  it("round-trips through JSON without losing dataVersions or note", () => {
    const file = buildCompensationFile();
    const back = JSON.parse(JSON.stringify(file)) as LcalcFile;
    expect(() => validateLcalcEnvelope(back)).not.toThrow();
    const loaded = parseLoadedCompensationLcalcInput(back);
    expect(loaded.result?.dataVersions).toEqual(
      parseLoadedCompensationLcalcInput(file).result?.dataVersions,
    );
  });

  it('migrateLcalcFile injects mode:"injury" into a legacy compensation@1 file lacking mode', () => {
    const file = buildCompensationFile();
    expect((file.payload.input as { mode?: string }).mode).toBeUndefined();

    const migrated = migrateLcalcFile(file);

    expect((migrated.payload.input as { mode?: string }).mode).toBe("injury");
    // 나머지 필드는 그대로 보존되고, injury parser 로 라우팅되어야 한다.
    expect(migrated.payload.note).toBe("compensation note");
    expect((migrated.payload.input as CompensationInput).base.birthDate).toBe("1996-01-01");
    expect(() => validateLcalcEnvelope(migrated)).not.toThrow();
    const loaded = parseLoadedCompensationLcalcInput(migrated);
    if (loaded.input.mode === "death") {
      throw new Error("expected injury input after migration");
    }
    expect(loaded.input.lostIncome.occupation).toBe("보통인부");
  });

  it("migrateLcalcFile keeps an explicit mode but injects accidentType:auto on a compensation@2 file", () => {
    const file = buildCompensationFile();
    const deathFile = {
      ...file,
      envelopeFeatures: ["compensation@2"],
      payload: {
        ...file.payload,
        input: { ...file.payload.input, mode: "death" },
      },
    } as LcalcFile;

    const migrated = migrateLcalcFile(deathFile);

    // mode 는 이미 있으니 그대로 두되(death 가 injury 로 오인되지 않음), @2 → @3 에서
    // accidentType:"auto" 를 주입해 산재 파일과 reader 분기를 견고하게 한다.
    expect((migrated.payload.input as { mode?: string }).mode).toBe("death");
    expect((migrated.payload.input as { accidentType?: string }).accidentType).toBe("auto");
  });

  it("migrateLcalcFile injects accidentType:auto into a legacy compensation@1 file (자동차 회귀 0)", () => {
    const file = buildCompensationFile();
    const migrated = migrateLcalcFile(file);
    // @1 파일은 mode·accidentType 모두 없음 → mode:"injury" + accidentType:"auto" 주입.
    expect((migrated.payload.input as { mode?: string }).mode).toBe("injury");
    expect((migrated.payload.input as { accidentType?: string }).accidentType).toBe("auto");
  });

  it("migrateLcalcFile leaves an explicit industrial accidentType untouched (compensation@3)", () => {
    const file = buildCompensationFile();
    const industrialFile = {
      ...file,
      envelopeFeatures: ["compensation@3"],
      payload: {
        ...file.payload,
        input: {
          ...file.payload.input,
          mode: "injury",
          accidentType: "industrial",
          industrialInsurance: { disabilityBenefitWon: 50_000_000 },
        },
      },
    } as LcalcFile;

    const migrated = migrateLcalcFile(industrialFile);

    // 이미 accidentType 이 있으면 주입하지 않는다 — 산재 파일이 자동차로 오인되지 않아야 한다.
    expect((migrated.payload.input as { accidentType?: string }).accidentType).toBe("industrial");
    expect(migrated).toEqual(industrialFile);
  });
});
