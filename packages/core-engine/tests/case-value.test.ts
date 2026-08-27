import { describe, expect, it } from "vitest";

import {
  caseValueDatasetVersionTag,
  computeRealEstateCaseValue,
  computeStampDuty,
  getCaseValueClaimKind,
  listCaseValueClaimKinds,
  loadCaseValueDataset,
} from "../src";

const computedAt = "2026-08-27T00:00:00.000Z";

describe("case-value dataset / 인지규칙 제10조·제12조·제13조 계수표", () => {
  it("소의 종류 38종을 담고 id 가 유일하다", () => {
    const kinds = listCaseValueClaimKinds();
    expect(kinds).toHaveLength(38);
    expect(new Set(kinds.map((k) => k.id)).size).toBe(38);
  });

  it("모든 계수가 0 초과 1 이하이고 정수 분자·분모다", () => {
    for (const k of listCaseValueClaimKinds()) {
      expect(Number.isInteger(k.numerator), k.id).toBe(true);
      expect(Number.isInteger(k.denominator), k.id).toBe(true);
      expect(k.numerator, k.id).toBeGreaterThan(0);
      expect(k.numerator / k.denominator, k.id).toBeLessThanOrEqual(1);
    }
  });

  it("전자소송 소가계산기 표의 대표 계수와 일치한다", () => {
    const ds = loadCaseValueDataset();
    const coeff = (id: string) => {
      const k = getCaseValueClaimKind(ds, id);
      return `${k.numerator}/${k.denominator}`;
    };
    expect(coeff("ownershipConfirmation")).toBe("1/1");
    expect(coeff("possessionConfirmation")).toBe("1/3");
    expect(coeff("deliveryByOwnership")).toBe("1/2");
    expect(coeff("deliveryByPossession")).toBe("1/3");
    expect(coeff("coOwnershipPartition")).toBe("1/3");
    expect(coeff("ownershipTransferRegistration")).toBe("1/1");
    expect(coeff("trueNameRestorationTransfer")).toBe("1/2");
    expect(coeff("provisionalRegEasement")).toBe("1/6");
    expect(coeff("cancellationVoidOwnership")).toBe("1/2");
    expect(coeff("provisionalCancelVoidSuperficies")).toBe("1/8");
    expect(coeff("provisionalCancelVoidEasement")).toBe("1/12");
    expect(coeff("registrationAcceptance")).toBe("1/10");
  });

  it("dataVersion 태그는 case-value/v1.0.0", () => {
    expect(caseValueDatasetVersionTag(loadCaseValueDataset())).toBe("case-value/v1.0.0");
  });

  it("sourceArticle 이 통상의 소는 제12조, 등기·등록은 제13조를 가리킨다", () => {
    const ds = loadCaseValueDataset();
    const article = (id: string) => getCaseValueClaimKind(ds, id).sourceArticle;
    // 확인의 소는 제12조 제1호가 제10조를 준용하는 구조다.
    expect(article("ownershipConfirmation")).toBe("제12조 제1호·제10조 제1항");
    expect(article("jeonseConfirmation")).toBe("제12조 제1호·제10조 제6항");
    expect(article("deliveryByOwnership")).toBe("제12조 제5호 가목");
    expect(article("adjacentRelation")).toBe("제12조 제6호");
    expect(article("coOwnershipPartition")).toBe("제12조 제7호");
    expect(article("boundaryDetermination")).toBe("제12조 제8호");
    expect(article("ownershipTransferRegistration")).toBe("제13조 제1항 제1호");
    expect(article("limitedRightSecurity")).toBe("제13조 제1항 제2호 나목");
    expect(article("registrationAcceptance")).toBe("제13조 제2항");
    // 등기·등록 26항목이 전부 제13조다. 예전에는 제12조로 한 조씩 밀려 있었다.
    for (const k of ds.claimKinds.filter((k) => k.groupKo === "등기·등록 절차에 관한 소")) {
      expect(k.sourceArticle.startsWith("제13조"), k.id).toBe(true);
    }
  });

  it("지역권은 승역지, 상린관계·경계확정은 각자의 토지부분 가액을 기준으로 한다", () => {
    const ds = loadCaseValueDataset();
    const base = (id: string) => getCaseValueClaimKind(ds, id).objectLabelKo;
    for (const id of [
      "easementConfirmation",
      "limitedRightEasement",
      "provisionalRegEasement",
      "cancellationTerminationEasement",
      "cancellationVoidEasement",
      "provisionalCancelTerminationEasement",
      "provisionalCancelVoidEasement",
    ]) {
      expect(base(id), id).toBe("승역지 가액");
    }
    expect(base("adjacentRelation")).toBe("부담을 받는 이웃 토지 부분의 가액");
    expect(base("boundaryDetermination")).toBe("다툼이 있는 범위의 토지부분의 가액");
    expect(base("deliveryByOwnership")).toBe("목적물 가액");
  });

  it("담보물권·전세권 8항목이 피담보채권액 한도 종류로 표시된다", () => {
    const ds = loadCaseValueDataset();
    const limited = ds.claimKinds.filter((k) => k.securedClaimLimited === true).map((k) => k.id);
    expect(limited).toEqual([
      "securityRightConfirmation",
      "jeonseConfirmation",
      "limitedRightSecurity",
      "provisionalRegSecurity",
      "cancellationTerminationSecurity",
      "cancellationVoidSecurity",
      "provisionalCancelTerminationSecurity",
      "provisionalCancelVoidSecurity",
    ]);
  });

  it("법령 링크가 인지규칙 현행 법령ID 를 가리킨다", () => {
    const { sourceLaw } = loadCaseValueDataset();
    expect(sourceLaw.lsId).toBe("005771");
    expect(sourceLaw.sourceUrl).toBe("https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=254623");
    expect(sourceLaw.currentEffectiveFrom).toBe("2023-10-19");
  });
});

describe("computeRealEstateCaseValue", () => {
  it("소유권에 기한 인도청구는 목적물 가액의 1/2", () => {
    const r = computeRealEstateCaseValue(
      { objectValueWon: 300_000_000, claimKindId: "deliveryByOwnership" },
      { computedAt },
    );
    expect(r.caseValue).toBe(150_000_000);
    expect(r.coefficientText).toBe("1/2");
    expect(r.formulaText).toContain("인지규칙 제12조 제5호 가목");
    expect(r.formulaText).toContain("목적물 가액 300,000,000원");
  });

  it("지역권은 계산식에 승역지 가액이라고 적힌다", () => {
    const r = computeRealEstateCaseValue(
      { objectValueWon: 300_000_000, claimKindId: "easementConfirmation" },
      { computedAt },
    );
    expect(r.caseValue).toBe(100_000_000);
    expect(r.formulaText).toContain("승역지 가액 300,000,000원");
    expect(r.formulaText).toContain("인지규칙 제12조 제1호·제10조 제4항");
  });

  it("공유지분을 곱한 뒤 계수를 적용한다", () => {
    const r = computeRealEstateCaseValue(
      {
        objectValueWon: 300_000_000,
        claimKindId: "coOwnershipPartition",
        shareNumerator: 1,
        shareDenominator: 2,
      },
      { computedAt },
    );
    expect(r.objectValueAfterShare).toBe(150_000_000);
    expect(r.caseValue).toBe(50_000_000); // 150,000,000 × 1/3
    expect(r.formulaText).toContain("공유지분 1/2");
  });

  it("1/3 · 1/12 같은 무한소수 계수도 원 단위가 어긋나지 않는다", () => {
    // 부동소수로 (v * (1/3)) 을 하면 100 이 아니라 99.999… 로 떨어지는 값들.
    const third = computeRealEstateCaseValue(
      { objectValueWon: 300, claimKindId: "possessionConfirmation" },
      { computedAt },
    );
    expect(third.caseValue).toBe(100);
    const twelfth = computeRealEstateCaseValue(
      { objectValueWon: 1_200_000_003, claimKindId: "provisionalCancelVoidEasement" },
      { computedAt },
    );
    expect(twelfth.caseValue).toBe(Math.floor(1_200_000_003 / 12));
  });

  it("산출 소가를 그대로 인지대 엔진에 넘길 수 있다", () => {
    const caseValue = computeRealEstateCaseValue(
      { objectValueWon: 300_000_000, claimKindId: "deliveryByOwnership" },
      { computedAt },
    ).caseValue;
    const stampDuty = computeStampDuty(
      { caseValue, caseType: "civilFirstInstanceSingle", appealsLevel: "firstInstance" },
      { computedAt },
    );
    // 1.5억 → 3구간: 150,000,000 × 0.004 + 55,000 = 655,000
    expect(stampDuty.amount).toBe(655_000);
  });

  it("담보물권은 목적물 가액이 아니라 피담보채권액을 기준으로 한다", () => {
    // 근저당권 채권최고액 1.2억, 목적물 3억. 예전에는 3억 전액이 소가가 되어 과다 산출됐다.
    const r = computeRealEstateCaseValue(
      {
        objectValueWon: 300_000_000,
        claimKindId: "limitedRightSecurity",
        securedClaimWon: 120_000_000,
      },
      { computedAt },
    );
    expect(r.caseValue).toBe(120_000_000);
    expect(r.rightValueBeforeCoefficient).toBe(120_000_000);
    expect(r.objectValueAfterShare).toBe(300_000_000);
    expect(r.formulaText).toContain(
      "목적물 가액 300,000,000원 한도의 피담보채권액 120,000,000원 (권리 가액 120,000,000원)",
    );
  });

  it("피담보채권액이 목적물 가액을 넘으면 목적물 가액이 한도가 된다", () => {
    const r = computeRealEstateCaseValue(
      {
        objectValueWon: 100_000_000,
        claimKindId: "limitedRightSecurity",
        securedClaimWon: 400_000_000,
      },
      { computedAt },
    );
    expect(r.caseValue).toBe(100_000_000);
    expect(r.rightValueBeforeCoefficient).toBe(100_000_000);
  });

  it("한도를 적용한 뒤 계수를 곱한다", () => {
    // 가등기 말소(무효·취소) 담보물권 = 제3호 가액의 1/2 이므로 최종 1/4.
    const r = computeRealEstateCaseValue(
      {
        objectValueWon: 300_000_000,
        claimKindId: "provisionalCancelVoidSecurity",
        securedClaimWon: 120_000_000,
      },
      { computedAt },
    );
    expect(r.coefficientText).toBe("1/4");
    expect(r.caseValue).toBe(30_000_000);
  });

  it("피담보채권액 없이 담보물권·전세권 소가를 구하면 조용히 통과하지 않는다", () => {
    for (const claimKindId of [
      "securityRightConfirmation",
      "jeonseConfirmation",
      "limitedRightSecurity",
      "provisionalRegSecurity",
      "cancellationTerminationSecurity",
      "cancellationVoidSecurity",
      "provisionalCancelTerminationSecurity",
      "provisionalCancelVoidSecurity",
    ]) {
      expect(() =>
        computeRealEstateCaseValue({ objectValueWon: 300_000_000, claimKindId }, { computedAt }),
      ).toThrow(RangeError);
    }
  });

  it("피담보채권액을 쓰지 않는 소의 종류에 넘기면 거부한다", () => {
    expect(() =>
      computeRealEstateCaseValue(
        {
          objectValueWon: 300_000_000,
          claimKindId: "deliveryByOwnership",
          securedClaimWon: 100_000_000,
        },
        { computedAt },
      ),
    ).toThrow(RangeError);
  });

  it("공유지분과 한도를 함께 쓰면 지분 반영 후의 목적물 가액이 한도가 된다", () => {
    const r = computeRealEstateCaseValue(
      {
        objectValueWon: 300_000_000,
        claimKindId: "limitedRightSecurity",
        securedClaimWon: 200_000_000,
        shareNumerator: 1,
        shareDenominator: 2,
      },
      { computedAt },
    );
    expect(r.objectValueAfterShare).toBe(150_000_000);
    expect(r.caseValue).toBe(150_000_000); // min(1.5억, 2억)
  });

  it("없는 소의 종류 · 1 을 넘는 지분 · 음수 가액은 거부한다", () => {
    expect(() =>
      computeRealEstateCaseValue({ objectValueWon: 1000, claimKindId: "nope" }, { computedAt }),
    ).toThrow(RangeError);
    expect(() =>
      computeRealEstateCaseValue(
        {
          objectValueWon: 1000,
          claimKindId: "deliveryByOwnership",
          shareNumerator: 3,
          shareDenominator: 2,
        },
        { computedAt },
      ),
    ).toThrow(RangeError);
    expect(() =>
      computeRealEstateCaseValue(
        { objectValueWon: -1, claimKindId: "deliveryByOwnership" },
        { computedAt },
      ),
    ).toThrow(RangeError);
  });
});
