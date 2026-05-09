import { describe, expect, it } from "vitest";

import {
  calculateInterest,
  datasetVersionTag,
  type LegalRateDataset,
  type CalcOptions,
  type InterestInput,
} from "../src";
import { DEFAULT_LEGAL_RATES_DATASET } from "../src/legal-rates.dataset.generated";

/**
 * `data/legal-rates/v1.json` 을 빌드 타임에 정적으로 인라인. tsc rootDir 위반 없이
 * single-source 동등성을 검증하기 위한 목적 (B8). golden.test.ts 와 동일한 패턴.
 */
const v1Modules = import.meta.glob<LegalRateDataset>("../../../data/legal-rates/v1.json", {
  eager: true,
  import: "default",
});
const v1Json = Object.values(v1Modules)[0]!;

describe("B8: workspace JSON ↔ bundled dataset (single source 검증)", () => {
  it("DEFAULT_LEGAL_RATES_DATASET deep-equals data/legal-rates/v1.json", () => {
    expect(DEFAULT_LEGAL_RATES_DATASET).toEqual(v1Json);
  });

  it("JSON.stringify 직렬화 결과가 byte-equivalent", () => {
    expect(JSON.stringify(DEFAULT_LEGAL_RATES_DATASET)).toBe(JSON.stringify(v1Json));
  });

  it("dataset version 태그가 v1.json version 과 일치", () => {
    expect(datasetVersionTag(DEFAULT_LEGAL_RATES_DATASET)).toBe(`legal-rates/v${v1Json.version}`);
  });
});

/**
 * B9 — calculateInterest(input, deps?: { dataset })
 *
 * case-001 입력 (1_000_000원, civil 5%, 2023-01-01 ~ 2024-01-01, totalDays/fixed365/exclude-first)
 * 으로 dataset 만 바꿔 결과가 dataset 에 따라 결정적으로 달라짐을 입증.
 */
describe("B9: calculateInterest dataset injection 결정성", () => {
  const case001: InterestInput = {
    principal: 1_000_000,
    startDate: "2023-01-01",
    endDate: "2024-01-01",
    legalRatePreset: "civil",
    options: {
      mode: "totalDays",
      leapYear: "fixed365",
      includeFirstDay: false,
    } satisfies CalcOptions,
  };

  it("default 호출 (deps 미지정) — bundled dataset, dataVersion = v1.0.0", () => {
    const result = calculateInterest(case001);
    expect(result.totalInterest).toBe(50_000);
    expect(result.dataVersion).toBe("legal-rates/v1.0.0");
  });

  it("custom dataset 주입 — civil 7% → totalInterest 70,000, dataVersion 변경", () => {
    const custom: LegalRateDataset = {
      version: "9.9.9-test",
      updatedAt: "2030-01-01",
      rates: [
        {
          code: "civil",
          label_ko: "test civil 7%",
          annualRate: 0.07,
          validFrom: "1958-02-22",
          validTo: null,
        },
      ],
    };
    const result = calculateInterest(case001, { dataset: custom });
    expect(result.totalInterest).toBe(70_000);
    expect(result.dataVersion).toBe("legal-rates/v9.9.9-test");
  });

  it("dataset 가 다르면 totalInterest 가 다르다 (결정성)", () => {
    const dsA: LegalRateDataset = {
      version: "A",
      updatedAt: "2030-01-01",
      rates: [
        {
          code: "civil",
          label_ko: "A",
          annualRate: 0.03,
          validFrom: "1958-02-22",
          validTo: null,
        },
      ],
    };
    const dsB: LegalRateDataset = {
      version: "B",
      updatedAt: "2030-01-01",
      rates: [
        {
          code: "civil",
          label_ko: "B",
          annualRate: 0.08,
          validFrom: "1958-02-22",
          validTo: null,
        },
      ],
    };
    const a = calculateInterest(case001, { dataset: dsA });
    const b = calculateInterest(case001, { dataset: dsB });
    expect(a.totalInterest).toBe(30_000);
    expect(b.totalInterest).toBe(80_000);
    expect(a.totalInterest).not.toBe(b.totalInterest);
  });

  it("주입된 dataset 도 validate 를 통과해야 한다 (validTo < validFrom 거부)", () => {
    const bad: LegalRateDataset = {
      version: "bad",
      updatedAt: "2030-01-01",
      rates: [
        {
          code: "civil",
          label_ko: "bad",
          annualRate: 0.05,
          validFrom: "2020-01-01",
          validTo: "2019-01-01",
        },
      ],
    };
    expect(() => calculateInterest(case001, { dataset: bad })).toThrow(/validTo/);
  });
});
