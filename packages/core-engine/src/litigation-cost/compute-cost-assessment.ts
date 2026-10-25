import { STANDARD_DISCLAIMER } from "../disclaimers";
import type { IsoDate } from "../types";
import { computeDeliveryFee } from "./compute-delivery-fee";
import { computeStampDuty } from "./compute-stamp-duty";
import { deliveryDatasetVersionTag, loadDeliveryDataset } from "./delivery-dataset";
import { decimalToFraction } from "./helpers";
import {
  lawyerFeeDatasetVersionTag,
  loadLawyerFeeDataset,
  type LawyerFeeArticle5Reason,
  type LawyerFeeDataset,
  type LawyerFeeRuleVersion,
  type LawyerFeeRuleVersionKey,
} from "./lawyer-fee-dataset";
import { loadStampDutyDataset, stampDutyVersionTag } from "./stamp-duty-dataset";
import type { AppealsLevel, CaseType, LawyerFeeBracket } from "./types";

/**
 * 소송비용액 확정 계산 (민사소송법 제110조~제112조).
 *
 * 심급마다 [인지액 + 송달료 + 변호사보수 + 기타] 를 당사자별로 더하고, 본안 재판이 정한 부담
 * 비율로 상대방 부담분을 낸 뒤, 양쪽 비용이 다 있으면 대등액에서 상계한다 (제112조).
 *
 * 변호사보수는 「변호사보수의 소송비용 산입에 관한 규칙」 판을 심급 접수일(1심 소 제기일,
 * 상소심 상소 제기일)로 고른다. 2008·2013·2018판 부칙 제2조는 시행 전 접수 사건에 신 규칙을
 * 쓰지 않되 시행 후 상소된 상소심에는 쓰므로 심급마다 판이 갈릴 수 있다. 경과규정이 없는
 * 2003·2020판도 같은 기준으로 고른다 (2026-10-25 사용자 결정, 판례 미확인). 판은 심급별로
 * 직접 바꿀 수 있다.
 *
 * 산정 순서: 별표 → 제3조 제1항 단서 최저액 → 1/2 (제5조 또는 제3조 제2항) → 원 미만 버림 →
 * 지급보수액 한도. 최저액을 먼저 씌우고 반으로 나누는 순서는 2008~2018판 제5조 "제3조의 기준에
 * 의하여 산정한 금액의 2분의 1" 문언에 따른 것이며 판례로 확인하지 않았다.
 */

export type CostAssessmentParty = "plaintiff" | "defendant";

/** 1/2 사유. `provisional` = 제3조 제2항 가압류·가처분, 나머지는 제5조. */
export type CostAssessmentHalfReason = "none" | LawyerFeeArticle5Reason | "provisional";

/** 인지액·송달료 출처. `auto` 는 기존 인지·송달료 엔진으로 계산한다. */
export type CostAssessmentAmountSource = { mode: "manual"; amountWon: number } | { mode: "auto" };

export interface CostAssessmentPartyCostsInput {
  stampDuty: CostAssessmentAmountSource;
  deliveryFee: CostAssessmentAmountSource;
  /** 변호사 선임 여부. false 면 변호사보수 0. */
  lawyerRetained: boolean;
  /** 지급보수액 (규칙 제3조 제1항). 미입력이면 별표 산정액을 그대로 쓴다. */
  paidLawyerFeeWon?: number;
  /** 기타 실비 (민사소송비용법 제3조~제9조 등). 직접 입력. */
  otherCostsWon?: number;
}

export interface CostAssessmentInstanceInput {
  level: AppealsLevel;
  /** 인지·송달료 자동 계산용 사건구분. */
  caseType: CaseType;
  /** 심급 접수일. 1심 = 소 제기일, 상소심 = 상소 제기일. */
  filingDate: IsoDate;
  /** 소송목적의 값. 상소심은 상소로써 불복하는 범위 (인지규칙 제25조). 원 단위 정수. */
  caseValue: number;
  /** 송달료 자동 계산용 당사자수. 기본 2. */
  partyCount?: number;
  isElectronicFiling?: boolean;
  /** 규칙 판 직접 지정. 없으면 filingDate 로 고른다. */
  ruleVersionOverride?: LawyerFeeRuleVersionKey;
  halfReason?: CostAssessmentHalfReason;
  plaintiff: CostAssessmentPartyCostsInput;
  defendant: CostAssessmentPartyCostsInput;
}

export interface CostAssessmentInput {
  instances: CostAssessmentInstanceInput[];
  /** 소송비용 부담 비율 (정수 비, 예: 원고 3 : 피고 7). */
  burden: { plaintiff: number; defendant: number };
  /** 확정 신청인. */
  applicant: CostAssessmentParty;
  /** 상대방도 비용계산서를 냈는지. false 면 상계 없이 신청인 비용만 본다 (제111조 제2항, 제112조 단서). */
  opponentSubmitted: boolean;
}

export interface CostAssessmentLawyerFee {
  ruleVersion: LawyerFeeRuleVersionKey;
  ruleNumber: string;
  table: LawyerFeeRuleVersion["table"];
  selectedBy: "filingDate" | "override";
  /** 별표 산정액 (원 미만 버림, 최저액·1/2 전). */
  tableAmountWon: number;
  minimumApplied: boolean;
  halved: boolean;
  /** 지급보수액 한도 전 산정액. */
  assessedWon: number;
  formulaText: string;
}

export interface CostAssessmentPartyCosts {
  stampDutyWon: number;
  stampDutyFormula: string;
  deliveryFeeWon: number;
  deliveryFeeFormula: string;
  lawyerFeeWon: number;
  lawyerFeeFormula: string;
  otherCostsWon: number;
  subtotalWon: number;
}

export interface CostAssessmentInstanceResult {
  level: AppealsLevel;
  filingDate: IsoDate;
  caseValue: number;
  lawyerFee: CostAssessmentLawyerFee;
  plaintiff: CostAssessmentPartyCosts;
  defendant: CostAssessmentPartyCosts;
}

/** 한 당사자 비용 중 상대방 부담분. */
export interface CostAssessmentClaim {
  /** 비용을 쓴 당사자 (받을 사람). */
  creditor: CostAssessmentParty;
  totalCostsWon: number;
  amountWon: number;
  formulaText: string;
}

export interface CostAssessmentResult {
  instances: CostAssessmentInstanceResult[];
  totals: Record<CostAssessmentParty, number>;
  applicantClaim: CostAssessmentClaim;
  /** 상대방 비용계산서를 낸 경우만. */
  opponentClaim: CostAssessmentClaim | null;
  /** 최종 지급 관계. amountWon 0 이면 주고받을 것이 없다. */
  net: {
    payer: CostAssessmentParty;
    payee: CostAssessmentParty;
    amountWon: number;
    formulaText: string;
  };
  warnings: string[];
  disclaimer: string;
  dataVersions: Record<string, string>;
  computedAt: string;
}

export interface ComputeCostAssessmentDeps {
  lawyerFeeDataset?: LawyerFeeDataset;
  computedAt?: string;
}

const LEVEL_LABEL: Record<AppealsLevel, string> = {
  firstInstance: "1심",
  appeal: "항소심",
  supreme: "상고심",
};

export const COST_ASSESSMENT_PARTY_LABEL: Record<CostAssessmentParty, string> = {
  plaintiff: "원고",
  defendant: "피고",
};

const HALF_REASON_LABEL: Record<Exclude<CostAssessmentHalfReason, "none">, string> = {
  admissionJudgment: "전부자백·자백간주(의제자백) 판결",
  nonJudgmentEnding: "화해·포기·인낙 등 재판에 의하지 않은 완결",
  noOralHearingJudgment: "무변론 판결",
  orderForPerformance: "이행권고결정",
  provisional: "가압류·가처분",
};

const won = (n: number | bigint): string => n.toLocaleString("en-US");

function fail(message: string): never {
  throw new RangeError(`소송비용확정 입력 검증 실패: ${message}`);
}

function assertWon(value: number, context: string): void {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${context} 는 0 이상의 원 단위 정수여야 합니다 (입력: ${String(value)})`);
  }
}

/** 접수일에 시행 중인 판 (effectiveFrom ≤ 접수일 인 마지막 판). */
export function selectLawyerFeeRuleVersion(
  dataset: LawyerFeeDataset,
  filingDate: IsoDate,
): LawyerFeeRuleVersion {
  let found: LawyerFeeRuleVersion | undefined;
  for (const v of dataset.ruleVersions) {
    if (v.effectiveFrom <= filingDate) found = v;
  }
  if (found === undefined) {
    fail(
      `접수일 ${filingDate} 은 규칙 제정 시행일(${dataset.ruleVersions[0]!.effectiveFrom}) 전입니다`,
    );
  }
  return found;
}

function tableOf(dataset: LawyerFeeDataset, version: LawyerFeeRuleVersion): LawyerFeeBracket[] {
  return version.table === "D" ? dataset.brackets : dataset.historicalTables[version.table];
}

function computeInstanceLawyerFee(
  dataset: LawyerFeeDataset,
  instance: CostAssessmentInstanceInput,
): CostAssessmentLawyerFee {
  const version =
    instance.ruleVersionOverride === undefined
      ? selectLawyerFeeRuleVersion(dataset, instance.filingDate)
      : dataset.ruleVersions.find((v) => v.key === instance.ruleVersionOverride);
  if (version === undefined) {
    fail(`알 수 없는 규칙 판입니다 (입력: ${String(instance.ruleVersionOverride)})`);
  }
  const brackets = tableOf(dataset, version)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const bracket = brackets.find(
    (b) =>
      instance.caseValue >= b.scopeStart &&
      (b.scopeEnd === null || instance.caseValue < b.scopeEnd),
  )!;

  // 별표 = base + (소가 − 구간 시작) × 요율. 요율을 십진 유리수로 바꿔 BigInt 로 정확히 계산한다.
  const rate = decimalToFraction(bracket.rate);
  let num =
    BigInt(bracket.baseAmount) * rate.den +
    BigInt(instance.caseValue - bracket.scopeStart) * rate.num;
  let den = rate.den;
  const tableAmountWon = Number(num / den);
  const segments = [
    bracket.rate === 0
      ? `별표 ${bracket.sortOrder}구간 ${won(bracket.baseAmount)}원`
      : `별표 ${bracket.sortOrder}구간 ${won(bracket.baseAmount)} + (${won(instance.caseValue)} - ${won(bracket.scopeStart)}) × ${bracket.rate} = ${won(tableAmountWon)}원`,
  ];

  let minimumApplied = false;
  if (version.minimumWon !== null && num < BigInt(version.minimumWon) * den) {
    num = BigInt(version.minimumWon);
    den = 1n;
    minimumApplied = true;
    segments.push(`${version.minimumArticle} 최저액 ${won(version.minimumWon)}원`);
  }

  const reason = instance.halfReason ?? "none";
  let halved = false;
  if (reason === "provisional") {
    if (version.provisionalHalf) {
      halved = true;
      segments.push(`제3조 제2항 가압류·가처분 1/2 (신청사건은 변론 또는 심문을 거친 경우에 한함)`);
    } else {
      segments.push(
        `${version.key} 판에는 가압류·가처분 1/2 규정(제3조 제2항)이 없어 감액하지 않음`,
      );
    }
  } else if (reason !== "none") {
    if (version.article5Reasons.includes(reason)) {
      halved = true;
      segments.push(`제5조 ${HALF_REASON_LABEL[reason]} 1/2`);
    } else {
      segments.push(
        `${version.key} 판 제5조에 ${HALF_REASON_LABEL[reason]} 사유가 없어 감액하지 않음`,
      );
    }
  }
  if (halved) den *= 2n;
  const assessedWon = Number(num / den);
  if (minimumApplied && halved) {
    segments.push("최저액을 먼저 적용한 뒤 1/2 (규칙 문언 순서, 판례 미확인)");
  }

  const selectedBy = instance.ruleVersionOverride === undefined ? "filingDate" : "override";
  const selection =
    selectedBy === "override"
      ? `${version.ruleNumber} 직접 지정`
      : `접수일 ${instance.filingDate} 기준 ${version.ruleNumber} (시행 ${version.effectiveFrom})` +
        (version.transitionalProvision === null && version.key !== "v1981"
          ? ", 경과규정이 없는 판이라 심급 접수일 기준으로 고름 (판례 미확인)"
          : version.transitionalProvision !== null
            ? ", 부칙 제2조: 시행 전 접수 사건 제외, 시행 후 상소된 상소심은 적용"
            : "");

  return {
    ruleVersion: version.key,
    ruleNumber: version.ruleNumber,
    table: version.table,
    selectedBy,
    tableAmountWon,
    minimumApplied,
    halved,
    assessedWon,
    formulaText: `${selection}. ${segments.join(" → ")} → ${won(assessedWon)}원 (제3조 제1항 각 심급단위)`,
  };
}

function partyCosts(
  instance: CostAssessmentInstanceInput,
  party: CostAssessmentPartyCostsInput,
  fee: CostAssessmentLawyerFee,
  computedAt: string,
  label: string,
): CostAssessmentPartyCosts {
  let stampDutyWon: number;
  let stampDutyFormula: string;
  if (party.stampDuty.mode === "manual") {
    assertWon(party.stampDuty.amountWon, `${label} 인지액`);
    stampDutyWon = party.stampDuty.amountWon;
    stampDutyFormula = "직접 입력 (민사소송비용법 제2조, 붙인 인지액)";
  } else {
    const r = computeStampDuty(
      {
        caseValue: instance.caseValue,
        caseType: instance.caseType,
        appealsLevel: instance.level,
        filingDate: instance.filingDate,
        ...(instance.isElectronicFiling === undefined
          ? {}
          : { isElectronicFiling: instance.isElectronicFiling }),
      },
      { computedAt },
    );
    stampDutyWon = r.amount;
    stampDutyFormula = `자동 계산: ${r.formulaText}`;
  }

  let deliveryFeeWon: number;
  let deliveryFeeFormula: string;
  if (party.deliveryFee.mode === "manual") {
    assertWon(party.deliveryFee.amountWon, `${label} 송달료`);
    deliveryFeeWon = party.deliveryFee.amountWon;
    deliveryFeeFormula = "직접 입력 (실제 쓰인 송달료)";
  } else {
    const r = computeDeliveryFee(
      {
        caseType: instance.caseType,
        partyCount: instance.partyCount ?? 2,
        filingDate: instance.filingDate,
      },
      { computedAt },
    );
    deliveryFeeWon = r.amount;
    deliveryFeeFormula = `자동 계산 (예납 기준 추정): ${r.formulaText}`;
  }

  let lawyerFeeWon = 0;
  let lawyerFeeFormula = "변호사 미선임";
  if (party.lawyerRetained) {
    lawyerFeeWon = fee.assessedWon;
    lawyerFeeFormula = `산정액 ${won(fee.assessedWon)}원`;
    if (party.paidLawyerFeeWon === undefined) {
      lawyerFeeFormula +=
        " (지급보수액 미입력: 실제 산입액은 지급보수액 범위 내로 제한됨, 제3조 제1항)";
    } else {
      assertWon(party.paidLawyerFeeWon, `${label} 지급보수액`);
      if (party.paidLawyerFeeWon < fee.assessedWon) {
        lawyerFeeWon = party.paidLawyerFeeWon;
        lawyerFeeFormula += ` → 지급보수액 ${won(party.paidLawyerFeeWon)}원 한도 (제3조 제1항)`;
      } else {
        lawyerFeeFormula += ` (지급보수액 ${won(party.paidLawyerFeeWon)}원 이내)`;
      }
    }
  }

  const otherCostsWon = party.otherCostsWon ?? 0;
  assertWon(otherCostsWon, `${label} 기타 비용`);
  return {
    stampDutyWon,
    stampDutyFormula,
    deliveryFeeWon,
    deliveryFeeFormula,
    lawyerFeeWon,
    lawyerFeeFormula,
    otherCostsWon,
    subtotalWon: stampDutyWon + deliveryFeeWon + lawyerFeeWon + otherCostsWon,
  };
}

function other(party: CostAssessmentParty): CostAssessmentParty {
  return party === "plaintiff" ? "defendant" : "plaintiff";
}

function claimOf(
  creditor: CostAssessmentParty,
  totalCostsWon: number,
  burden: CostAssessmentInput["burden"],
): CostAssessmentClaim {
  const debtor = other(creditor);
  const parts = BigInt(burden[debtor]);
  const sum = BigInt(burden.plaintiff + burden.defendant);
  const amountWon = Number((BigInt(totalCostsWon) * parts) / sum);
  return {
    creditor,
    totalCostsWon,
    amountWon,
    formulaText:
      `${COST_ASSESSMENT_PARTY_LABEL[creditor]} 비용 ${won(totalCostsWon)}원 × ${COST_ASSESSMENT_PARTY_LABEL[debtor]} 부담 ` +
      `${burden[debtor]}/${burden.plaintiff + burden.defendant} = ${won(amountWon)}원 (원 미만 버림, 민사소송법 제98조·제101조)`,
  };
}

/**
 * 소송비용액 확정 계산.
 *
 * @example
 *   computeCostAssessment({
 *     instances: [{ level: "firstInstance", caseType: "civilFirstInstanceSingle",
 *       filingDate: "2024-03-04", caseValue: 30_000_000, halfReason: "none",
 *       plaintiff: { stampDuty: { mode: "manual", amountWon: 140_000 },
 *         deliveryFee: { mode: "manual", amountWon: 104_000 }, lawyerRetained: true },
 *       defendant: { stampDuty: { mode: "manual", amountWon: 0 },
 *         deliveryFee: { mode: "manual", amountWon: 0 }, lawyerRetained: false } }],
 *     burden: { plaintiff: 3, defendant: 7 }, applicant: "plaintiff", opponentSubmitted: false,
 *   });
 */
export function computeCostAssessment(
  input: CostAssessmentInput,
  deps?: ComputeCostAssessmentDeps,
): CostAssessmentResult {
  const computedAt = deps?.computedAt ?? new Date().toISOString();
  const dataset = loadLawyerFeeDataset(deps?.lawyerFeeDataset);

  if (!Array.isArray(input.instances) || input.instances.length === 0) {
    fail("심급을 하나 이상 입력해야 합니다");
  }
  const { burden } = input;
  for (const party of ["plaintiff", "defendant"] as const) {
    if (!Number.isInteger(burden[party]) || burden[party] < 0) {
      fail(`${COST_ASSESSMENT_PARTY_LABEL[party]} 부담 비율은 0 이상의 정수여야 합니다`);
    }
  }
  if (burden.plaintiff + burden.defendant === 0) {
    fail("부담 비율의 합이 0 입니다");
  }

  const warnings: string[] = [];
  const instances = input.instances.map((instance, i): CostAssessmentInstanceResult => {
    const label = `${i + 1}번째 심급(${LEVEL_LABEL[instance.level] ?? String(instance.level)})`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(instance.filingDate)) {
      fail(`${label} 접수일이 YYYY-MM-DD 형식이 아닙니다 (입력: ${String(instance.filingDate)})`);
    }
    assertWon(instance.caseValue, `${label} 소가`);
    const fee = computeInstanceLawyerFee(dataset, instance);
    const usesAutoStamp =
      instance.plaintiff.stampDuty.mode === "auto" || instance.defendant.stampDuty.mode === "auto";
    const stampLaw = loadStampDutyDataset().sourceLaw;
    if (usesAutoStamp && instance.filingDate < stampLaw.currentEffectiveFrom) {
      warnings.push(
        `${label}: 인지액 자동 계산은 현행 인지법 구간식(${stampLaw.currentLawNumber}, 시행 ${stampLaw.currentEffectiveFrom})입니다. 접수 당시 실제 인지액과 다를 수 있으니 납부액을 직접 입력하는 편이 안전합니다.`,
      );
    }
    return {
      level: instance.level,
      filingDate: instance.filingDate,
      caseValue: instance.caseValue,
      lawyerFee: fee,
      plaintiff: partyCosts(instance, instance.plaintiff, fee, computedAt, `${label} 원고`),
      defendant: partyCosts(instance, instance.defendant, fee, computedAt, `${label} 피고`),
    };
  });

  const totals: Record<CostAssessmentParty, number> = {
    plaintiff: instances.reduce((s, r) => s + r.plaintiff.subtotalWon, 0),
    defendant: instances.reduce((s, r) => s + r.defendant.subtotalWon, 0),
  };

  const applicantClaim = claimOf(input.applicant, totals[input.applicant], burden);
  const opponent = other(input.applicant);
  const opponentClaim = input.opponentSubmitted
    ? claimOf(opponent, totals[opponent], burden)
    : null;

  const diff = applicantClaim.amountWon - (opponentClaim?.amountWon ?? 0);
  const payee = diff >= 0 ? input.applicant : opponent;
  const net = {
    payer: other(payee),
    payee,
    amountWon: Math.abs(diff),
    formulaText:
      opponentClaim === null
        ? `상대방 비용계산서 미제출: 상계 없이 신청인 비용만 확정 (민사소송법 제111조 제2항, 제112조 단서) → ` +
          `${COST_ASSESSMENT_PARTY_LABEL[other(payee)]}가 ${COST_ASSESSMENT_PARTY_LABEL[payee]}에게 ${won(Math.abs(diff))}원`
        : `${won(applicantClaim.amountWon)} - ${won(opponentClaim.amountWon)} 대등액 상계 (민사소송법 제112조) → ` +
          `${COST_ASSESSMENT_PARTY_LABEL[other(payee)]}가 ${COST_ASSESSMENT_PARTY_LABEL[payee]}에게 ${won(Math.abs(diff))}원`,
  };

  return {
    instances,
    totals,
    applicantClaim,
    opponentClaim,
    net,
    warnings,
    disclaimer: STANDARD_DISCLAIMER,
    dataVersions: {
      "lawyer-fee": lawyerFeeDatasetVersionTag(dataset),
      "stamp-duty": stampDutyVersionTag(loadStampDutyDataset()),
      delivery: deliveryDatasetVersionTag(loadDeliveryDataset()),
    },
    computedAt,
  };
}
