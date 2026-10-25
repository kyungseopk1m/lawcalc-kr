/**
 * 손해배상 추가 입력(기대여명·일실퇴직금·원고별 귀속·지연손해금)의 화면 상태와 엔진 입력 변환.
 *
 * 저장 호환 규칙: 엔진 키가 없으면 종전 계산이다. 각 섹션은 켰을 때만 키를 쓰고, 키가 없는 파일은
 * 꺼진 상태로 연다. 지연손해금은 손해배상액의 일부가 아니라 결과에서 바로 계산하는 보조 표시라
 * `.lcalc` 에 저장하지 않는다.
 */

import { addDays, addYears, formatCourtDate } from "@lawcalc-kr/core-engine";
import {
  buildDelayDamagesOrderText,
  computeDelayDamages,
  computeMediationInterest,
  faultRatioOfResponsibilityPercent,
  MEDIATION_DEFAULT_SPREAD_PERCENT,
  mediationResponsibilityPercents,
  type CompensationSegment,
  type CompensationAutoDeathInput,
  type CompensationAutoDeathResult,
  type CompensationInput,
  type CompensationLifeExpectancyInput,
  type CompensationResult,
  type LifeExpectancyResult,
  type LifeShortening,
  type LostRetirementInput,
  type LostRetirementResult,
} from "@lawcalc-kr/compensation";
import {
  listLifeExpectancyYears,
  loadLifeExpectancyTable,
} from "@lawcalc-kr/datasets-compensation";

import { formatWon, parseWonAmount } from "./format-won";
import { parseNumberText, readNumber } from "./parse-number";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function newUid(): string {
  return crypto.randomUUID();
}

/* ------------------------------------------------------------------ 기대여명 */

export type ShorteningMethod = "none" | LifeShortening["method"];

export interface LifeExpectancyFormState {
  enabled: boolean;
  basis: "accident" | "appraisal";
  appraisalDate: string;
  shorteningMethod: ShorteningMethod;
  /** 단축 값 (년수 또는 %). */
  shorteningText: string;
  /** 생명표 사망률 기준연도. "" 이면 자동 (기준일 연도). */
  tableYear: string;
  /** 여명종료일 직접 지정. "" 이면 자동. */
  endDateOverride: string;
}

/** 수록된 생명표 연도 (최신 우선). */
export const LIFE_TABLE_YEARS: readonly number[] =
  listLifeExpectancyYears(loadLifeExpectancyTable());

export function defaultLifeExpectancyFormState(): LifeExpectancyFormState {
  return {
    enabled: false,
    basis: "accident",
    appraisalDate: "",
    shorteningMethod: "none",
    shorteningText: "",
    tableYear: "",
    endDateOverride: "",
  };
}

const YEARS_FORMAT = { unit: "년", min: 0 } as const;
const PERCENT_FORMAT = { unit: "%", min: 0, max: 100 } as const;

export function shorteningFormatOf(method: ShorteningMethod) {
  return method === "percent" ? PERCENT_FORMAT : YEARS_FORMAT;
}

export function buildLifeExpectancyInput(
  state: LifeExpectancyFormState,
): CompensationLifeExpectancyInput | undefined {
  if (!state.enabled) return undefined;
  const input: CompensationLifeExpectancyInput = {};
  if (state.basis === "appraisal") {
    if (!ISO_DATE.test(state.appraisalDate)) throw new Error("기대여명: 신체감정일을 입력하세요.");
    input.basis = "appraisal";
    input.appraisalDate = state.appraisalDate;
  } else {
    input.basis = "accident";
  }
  if (state.shorteningMethod !== "none") {
    const value = readNumber(
      "기대여명 단축 값",
      parseNumberText(state.shorteningText, shorteningFormatOf(state.shorteningMethod)),
    );
    if (value === undefined || value <= 0) {
      throw new Error("기대여명 단축 값: 0보다 큰 값을 입력하세요.");
    }
    input.shortening =
      state.shorteningMethod === "percent"
        ? { method: "percent", percent: value }
        : { method: state.shorteningMethod, years: value };
  }
  if (state.tableYear !== "") input.tableYear = Number(state.tableYear);
  if (state.endDateOverride !== "") input.endDateOverride = state.endDateOverride;
  return input;
}

export function applyLifeExpectancyInput(
  input: CompensationLifeExpectancyInput | undefined,
): LifeExpectancyFormState {
  const base = defaultLifeExpectancyFormState();
  if (input === undefined) return base;
  const s = input.shortening;
  return {
    enabled: true,
    basis: input.basis ?? "accident",
    appraisalDate: input.appraisalDate ?? "",
    shorteningMethod: s?.method ?? "none",
    shorteningText: s === undefined ? "" : String(s.method === "percent" ? s.percent : s.years),
    tableYear: input.tableYear === undefined ? "" : String(input.tableYear),
    endDateOverride: input.endDateOverride ?? "",
  };
}

/** 기대여명 결과 한 줄. 화면·클립보드·PDF·CSV 공용. */
export function lifeExpectancyText(r: LifeExpectancyResult): string {
  const parts = [
    `기준일 ${r.baseDate} 만 ${r.age}세`,
    `${r.tableYear}년 생명표`,
    `기대여명 ${r.remainingYears}년`,
    `정상 여명종료일 ${r.normalEndDate}`,
  ];
  if (r.shortenedEndDate !== undefined) {
    parts.push(`단축 여명 ${r.shortenedRemainingYears}년 (${r.shortenedEndDate})`);
  }
  parts.push(`최종 여명종료일 ${r.endDate}${r.endDateOverridden ? " (직접 지정)" : ""}`);
  return parts.join(" · ");
}

/** 기대여명 이후 구간 생계비 공제 안내 (부상). Rust `LIVING_COST_AFTER_LIFE_NOTE` 와 같다. */
export const LIVING_COST_AFTER_LIFE_NOTE =
  "* 기대여명 이후 구간은 일실수입의 1/3을 생계비로 공제했습니다 (서울고법 2022. 2. 18. 선고 2020나2039267).";

/* -------------------------------------------------------------- 일실퇴직금 */

export interface LostRetirementFormState {
  enabled: boolean;
  method: LostRetirementInput["method"];
  amountText: string;
  retirementDate: string;
  payAtRetirementText: string;
  separationDate: string;
  payAtSeparationText: string;
  /** 노동능력상실률 (%). 사망은 쓰지 않는다 (100). */
  lossRatePercentText: string;
}

export const LOST_RETIREMENT_METHOD_LABELS: Record<LostRetirementInput["method"], string> = {
  direct: "직접 입력",
  presentValueMinusReceived: "① 정년퇴직금 현가 − 기수령액",
  differenceDiscounted: "② (정년퇴직금 − 기수령액)의 현가",
  bothDiscounted: "③ 정년퇴직금 현가 − 기수령액 현가",
};

export function defaultLostRetirementFormState(): LostRetirementFormState {
  return {
    enabled: false,
    method: "presentValueMinusReceived",
    amountText: "",
    retirementDate: "",
    payAtRetirementText: "",
    separationDate: "",
    payAtSeparationText: "",
    lossRatePercentText: "",
  };
}

export const LOSS_RATE_PERCENT_FORMAT = { unit: "%", min: 0, max: 100 } as const;

export function buildLostRetirementInput(
  state: LostRetirementFormState,
  mode: "injury" | "death",
): LostRetirementInput | undefined {
  if (!state.enabled) return undefined;
  if (state.method === "direct") {
    return { method: "direct", amountWon: parseWonAmount(state.amountText, 0) };
  }
  if (!ISO_DATE.test(state.retirementDate)) throw new Error("일실퇴직금: 정년예정일을 입력하세요.");
  if (!ISO_DATE.test(state.separationDate)) throw new Error("일실퇴직금: 퇴직일을 입력하세요.");
  let lossRatePercent = 100;
  if (mode === "injury") {
    const value = readNumber(
      "일실퇴직금 노동능력상실률",
      parseNumberText(state.lossRatePercentText, LOSS_RATE_PERCENT_FORMAT),
    );
    if (value === undefined || value <= 0) {
      throw new Error("일실퇴직금 노동능력상실률: 0%보다 큰 값을 입력하세요.");
    }
    lossRatePercent = value;
  }
  return {
    method: state.method,
    retirementDate: state.retirementDate,
    payAtRetirementWon: parseWonAmount(state.payAtRetirementText, 0),
    separationDate: state.separationDate,
    payAtSeparationWon: parseWonAmount(state.payAtSeparationText, 0),
    lossRatePercent,
  };
}

export function applyLostRetirementInput(
  input: LostRetirementInput | undefined,
): LostRetirementFormState {
  const base = defaultLostRetirementFormState();
  if (input === undefined) return base;
  if (input.method === "direct") {
    return { ...base, enabled: true, method: "direct", amountText: String(input.amountWon) };
  }
  return {
    ...base,
    enabled: true,
    method: input.method,
    retirementDate: input.retirementDate,
    payAtRetirementText: String(input.payAtRetirementWon),
    separationDate: input.separationDate,
    payAtSeparationText: String(input.payAtSeparationWon),
    lossRatePercentText: String(input.lossRatePercent),
  };
}

/** 일실퇴직금 계산 근거 (라벨, 값) 행. 화면·클립보드 공용. */
export function lostRetirementDetailRows(r: LostRetirementResult): [string, string][] {
  const rows: [string, string][] = [["방식", LOST_RETIREMENT_METHOD_LABELS[r.method]]];
  if (r.retirementMonths !== undefined && r.retirementFactor !== undefined) {
    rows.push([
      "정년까지 월수 · 현가율",
      `${r.retirementMonths}개월 · ${r.retirementFactor.toFixed(4)}`,
    ]);
  }
  if (r.separationMonths !== undefined && r.separationFactor !== undefined) {
    rows.push([
      "퇴직일까지 월수 · 현가율",
      `${r.separationMonths}개월 · ${r.separationFactor.toFixed(4)}`,
    ]);
  }
  if (r.retirementPresentValueWon !== undefined) {
    rows.push([
      r.method === "differenceDiscounted" ? "차액 현가" : "정년퇴직금 현가",
      formatWon(r.retirementPresentValueWon),
    ]);
  }
  if (r.separationPresentValueWon !== undefined) {
    rows.push(["기수령액 현가", formatWon(r.separationPresentValueWon)]);
  }
  if (r.method !== "direct") {
    rows.push(["상실률 곱하기 전", formatWon(r.baseWon)]);
    rows.push(["노동능력상실률", `${r.lossRatePercent}%`]);
  }
  rows.push(["산식", r.formulaText]);
  return rows;
}

/* -------------------------------------------------------------- 원고별 귀속 */

export type ClaimantRounding = NonNullable<
  NonNullable<CompensationInput["claimants"]>["finalRounding"]
>;

export const CLAIMANT_ROUNDING_LABELS: Record<ClaimantRounding, string> = {
  won: "원 단위 (원 미만 버림)",
  hundred: "100원 단위 (100원 미만 버림)",
};

export interface FamilyClaimantRow {
  uid: string;
  name: string;
  solatiumText: string;
}

export interface InjuryClaimantsFormState {
  enabled: boolean;
  family: FamilyClaimantRow[];
  finalRounding: ClaimantRounding;
}

export function emptyFamilyClaimant(): FamilyClaimantRow {
  return { uid: newUid(), name: "", solatiumText: "" };
}

export function defaultInjuryClaimantsFormState(): InjuryClaimantsFormState {
  return { enabled: false, family: [], finalRounding: "won" };
}

export function buildInjuryClaimantsInput(
  state: InjuryClaimantsFormState,
): CompensationInput["claimants"] {
  if (!state.enabled) return undefined;
  const family = state.family
    .map((row, i) => {
      const name = row.name.trim();
      const solatiumWon = parseWonAmount(row.solatiumText, 0);
      if (name.length === 0 && solatiumWon > 0) {
        throw new Error(`가족 원고 ${i + 1}번째: 이름을 입력하세요.`);
      }
      return { name, solatiumWon };
    })
    .filter((row) => row.name.length > 0);
  return { family, finalRounding: state.finalRounding };
}

export function applyInjuryClaimantsInput(
  input: CompensationInput["claimants"],
): InjuryClaimantsFormState {
  if (input === undefined) return defaultInjuryClaimantsFormState();
  return {
    enabled: true,
    family: (input.family ?? []).map((row) => ({
      uid: newUid(),
      name: row.name,
      solatiumText: String(row.solatiumWon),
    })),
    finalRounding: input.finalRounding ?? "won",
  };
}

export function injuryClaimantsForDirtySnapshot(state: InjuryClaimantsFormState) {
  return {
    enabled: state.enabled,
    family: state.family.map((row) => ({ name: row.name, solatiumText: row.solatiumText })),
    finalRounding: state.finalRounding,
  };
}

export interface DeathClaimantsFormState {
  enabled: boolean;
  /** 상속인 이름 → 고유 위자료 (원 텍스트). 지금 상속인 목록에 있는 이름만 계산에 쓴다. */
  ownSolatium: Record<string, string>;
  /** 장례비를 지출한 상속인. "" 이면 상속분대로 나눈다. */
  funeralPayer: string;
  /** 산재 장의비 (원). 산재 사망이고 장례비 지출 상속인이 있을 때만 쓴다. */
  funeralBenefitText: string;
  /** 상속인이 아닌 유족의 고유 위자료 행 (이름 · 위자료). */
  others: FamilyClaimantRow[];
  finalRounding: ClaimantRounding;
}

export function defaultDeathClaimantsFormState(): DeathClaimantsFormState {
  return {
    enabled: false,
    ownSolatium: {},
    funeralPayer: "",
    funeralBenefitText: "",
    others: [],
    finalRounding: "won",
  };
}

export function buildDeathClaimantsInput(
  state: DeathClaimantsFormState,
  heirNames: readonly string[],
): CompensationAutoDeathInput["claimants"] {
  if (!state.enabled) return undefined;
  const ownSolatium = heirNames
    .map((heirName) => ({
      heirName,
      solatiumWon: parseWonAmount(state.ownSolatium[heirName] ?? "", 0),
    }))
    .filter((item) => item.solatiumWon > 0);
  const claimants: NonNullable<CompensationAutoDeathInput["claimants"]> = {
    finalRounding: state.finalRounding,
  };
  if (ownSolatium.length > 0) claimants.ownSolatium = ownSolatium;
  if (state.funeralPayer !== "") claimants.funeralPayer = state.funeralPayer;
  const others = state.others
    .map((row, i) => {
      const name = row.name.trim();
      const solatiumWon = parseWonAmount(row.solatiumText, 0);
      if (name.length === 0 && solatiumWon > 0) {
        throw new Error(`상속인 아닌 유족 ${i + 1}번째: 이름을 입력하세요.`);
      }
      return { name, solatiumWon };
    })
    .filter((row) => row.name.length > 0);
  if (others.length > 0) claimants.otherClaimants = others;
  return claimants;
}

export function applyDeathClaimantsInput(
  input: CompensationAutoDeathInput["claimants"],
  funeralBenefitWon: number | undefined,
): DeathClaimantsFormState {
  if (input === undefined) return defaultDeathClaimantsFormState();
  return {
    enabled: true,
    ownSolatium: Object.fromEntries(
      (input.ownSolatium ?? []).map((item) => [item.heirName, String(item.solatiumWon)]),
    ),
    funeralPayer: input.funeralPayer ?? "",
    funeralBenefitText: funeralBenefitWon === undefined ? "" : String(funeralBenefitWon),
    others: (input.otherClaimants ?? []).map((row) => ({
      uid: newUid(),
      name: row.name,
      solatiumText: String(row.solatiumWon),
    })),
    finalRounding: input.finalRounding ?? "won",
  };
}

/**
 * 지금 상속인 목록에 없는 이름의 고유 위자료 (상속인 이름을 바꾸거나 지우면 생긴다).
 * 계산·저장에 쓰지 않으므로 화면에서 따로 알린다.
 */
export function orphanedOwnSolatium(
  state: DeathClaimantsFormState,
  heirNames: readonly string[],
): { name: string; won: number }[] {
  return Object.entries(state.ownSolatium)
    .filter(([name]) => !heirNames.includes(name))
    .map(([name, text]) => ({ name, won: parseWonAmount(text, 0) }))
    .filter((item) => item.won > 0);
}

/** dirty 스냅샷은 저장되는 값과 같아야 하므로 고유 위자료는 지금 상속인 이름만 남긴다. */
export function deathClaimantsForDirtySnapshot(
  state: DeathClaimantsFormState,
  heirNames: readonly string[],
) {
  return {
    ...state,
    ownSolatium: Object.fromEntries(
      Object.entries(state.ownSolatium).filter(([name]) => heirNames.includes(name)),
    ),
    // uid 는 화면 키라 저장 값이 아니다.
    others: state.others.map((row) => ({ name: row.name, solatiumText: row.solatiumText })),
  };
}

/** 원고별 귀속 결과인지 (사망: 상속인 행에 원고별 항목이 실림). */
export function hasDeathClaimantBreakdown(result: CompensationAutoDeathResult): boolean {
  return (result.inheritanceShares ?? []).some(
    (share) => share.inheritedPecuniaryWon !== undefined,
  );
}

/** 부상 원고 행 이름. */
export function injuryClaimantLabel(
  claimant: NonNullable<CompensationResult["claimants"]>[number],
) {
  return claimant.role === "victim" ? "피해자 본인" : (claimant.name ?? "가족 원고");
}

/* -------------------------------------------------------------- 지연손해금 */

export interface DelayDamagesFormState {
  enabled: boolean;
  /** 기산일. "" 이면 사고일. */
  startDate: string;
  judgmentDate: string;
  /** 제1심 변론종결일 (선택). */
  closingDate: string;
  /** 계산 기준일. */
  endDate: string;
}

export function defaultDelayDamagesFormState(today: string): DelayDamagesFormState {
  return { enabled: false, startDate: "", judgmentDate: "", closingDate: "", endDate: today };
}

export interface DelayDamagesRow {
  label: string;
  principalWon: number;
  interestWon: number;
  totalWon: number;
  orderText: string;
}

/** export payload 와 클립보드에 싣는 지연손해금 블록. Rust `CompensationDelayDamagesView` 와 같다. */
export interface DelayDamagesExport {
  basisText: string;
  rows: DelayDamagesRow[];
}

/** 지연손해금 원금 목록. 원고별 귀속을 쓰면 원고별, 아니면 최종 합계 하나. */
export function delayPrincipalsOf(
  result: CompensationResult | CompensationAutoDeathResult,
): { label: string; won: number }[] {
  if ("claimants" in result && result.claimants !== undefined) {
    return result.claimants.map((c) => ({ label: injuryClaimantLabel(c), won: c.amountWon }));
  }
  if ("mode" in result && result.mode === "death" && hasDeathClaimantBreakdown(result)) {
    return [...(result.inheritanceShares ?? []), ...(result.otherClaimants ?? [])].map((s) => ({
      label: s.name,
      won: s.amountWon,
    }));
  }
  return [{ label: "최종 합계", won: result.finalWon }];
}

/**
 * 지연손해금 계산. 입력이 모자라면 `error` 만 돌려준다 (손해배상 계산과 따로 보이는 보조 블록).
 */
export function computeDelayDamagesExport(
  state: DelayDamagesFormState,
  accidentDate: string,
  principals: { label: string; won: number }[],
): { value?: DelayDamagesExport; error?: string } {
  if (!state.enabled) return {};
  const startDate = state.startDate || accidentDate;
  if (!ISO_DATE.test(state.judgmentDate)) return { error: "판결 선고일을 입력하세요." };
  if (!ISO_DATE.test(state.endDate)) return { error: "계산 기준일을 입력하세요." };
  try {
    const rows = principals
      .filter((p) => p.won > 0)
      .map((p) => {
        const base = {
          principalWon: p.won,
          startDate,
          judgmentDate: state.judgmentDate,
          ...(state.closingDate ? { firstInstanceClosingDate: state.closingDate } : {}),
        };
        const r = computeDelayDamages({ ...base, endDate: state.endDate });
        return {
          label: p.label,
          principalWon: p.won,
          interestWon: r.totalInterest,
          totalWon: r.grandTotal,
          orderText: buildDelayDamagesOrderText(base),
        };
      });
    const closing = state.closingDate ? ` · 제1심 변론종결일 ${state.closingDate}` : "";
    return {
      value: {
        basisText: `기산일 ${startDate} · 판결 선고일 ${state.judgmentDate}${closing} · 계산 기준일 ${state.endDate}`,
        rows,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** 클립보드 지연손해금 줄. */
export function delayDamagesClipboardLines(delay: DelayDamagesExport | undefined): string[] {
  if (delay === undefined || delay.rows.length === 0) return [];
  return [
    "",
    "지연손해금 (손해배상액과 별도)",
    delay.basisText,
    "원고\t원금\t지연손해금\t원리금",
    ...delay.rows.map(
      (r) =>
        `${r.label}\t${formatWon(r.principalWon)}\t${formatWon(r.interestWon)}\t${formatWon(r.totalWon)}`,
    ),
    ...delay.rows.map(
      (r) => `주문: ${r.label === "최종 합계" ? "" : `${r.label}에게 `}${r.orderText}`,
    ),
  ];
}

/* ------------------------------------------------- 조정안·판결문 형식 문단 */

export type DocumentFormat = "mediation" | "judgment";

export const DOCUMENT_FORMAT_LABELS: Record<DocumentFormat, string> = {
  mediation: "조정안 형식",
  judgment: "판결 이유 형식",
};

/**
 * 조정안·판결 이유 형식 문단 설정. 결과에서 바로 만드는 보조 출력이라 지연손해금처럼 `.lcalc` 에
 * 저장하지 않는다.
 */
export interface DocumentFormState {
  enabled: boolean;
  format: DocumentFormat;
  /** 조정일. 사고일부터 이 날까지 연 5% 이자를 더한 금액을 함께 적는다. */
  mediationDate: string;
  /** 책임비율 가감 폭 (%p). */
  spreadPercentText: string;
}

export function defaultDocumentFormState(today: string): DocumentFormState {
  return {
    enabled: false,
    format: "mediation",
    mediationDate: today,
    spreadPercentText: String(MEDIATION_DEFAULT_SPREAD_PERCENT),
  };
}

export interface MediationScenarioRow {
  /** 피고 책임비율 (%). 첫 행이 입력 과실비율 기준. */
  responsibilityPercent: number;
  finalWon: number;
  interestWon: number;
  totalWon: number;
}

/** 출력 문단 1개. Rust `CompensationDocumentTextView` 와 같다. 표 행은 탭으로 칸을 나눈다. */
export interface DocumentTextBlock {
  title: string;
  lines: string[];
}

export interface DocumentExport {
  scenarios: MediationScenarioRow[];
  blocks: DocumentTextBlock[];
}

type AnyResult = CompensationResult | CompensationAutoDeathResult;
type DocumentInput = Pick<CompensationInput | CompensationAutoDeathInput, "faultRatio"> & {
  base: { birthDate: string; accidentDate: string; retirementAge?: number; sex: "male" | "female" };
};

function percentText(ratio: number): string {
  return `${(ratio * 100).toLocaleString("ko-KR", { maximumFractionDigits: 4 })}%`;
}

function hoffmanText(value: number): string {
  return value.toLocaleString("ko-KR", { minimumFractionDigits: 4, maximumFractionDigits: 8 });
}

function ageAt(birthDate: string, date: string): number {
  let age = Number(date.slice(0, 4)) - Number(birthDate.slice(0, 4));
  if (date.slice(5) < birthDate.slice(5)) age -= 1;
  return age;
}

function keepText(livingCostRatio: number): string {
  return Math.abs(livingCostRatio - 1 / 3) < 1e-12 ? "2/3" : percentText(1 - livingCostRatio);
}

function segmentPeriod(segment: CompensationSegment): string {
  return segment.startDate !== undefined && segment.endDate !== undefined
    ? `${formatCourtDate(segment.startDate)} ~ ${formatCourtDate(segment.endDate)}`
    : `사고 후 ${segment.startMonth}~${segment.endMonth}개월`;
}

/** 구간에 곱한 생계비 공제 후 비율 (없으면 undefined). 사망은 전 구간, 부상은 기대여명 이후 구간. */
function segmentKeep(result: AnyResult, segment: CompensationSegment): string | undefined {
  if ("mode" in result && result.mode === "death") {
    return keepText(result.livingCostDeductionRatio);
  }
  return segment.livingCostDeducted === true ? "2/3" : undefined;
}

function segmentFormulaLines(result: AnyResult): string[] {
  return result.segments.map((segment, i) => {
    const keep = segmentKeep(result, segment);
    return (
      `(${i + 1}) ${segmentPeriod(segment)} ${segment.endMonth - segment.startMonth}개월: ` +
      `월 ${formatWon(segment.monthlyWageWon)} × ${percentText(segment.lossRate)}` +
      `${keep !== undefined ? ` × ${keep}` : ""} × ${hoffmanText(segment.appliedHoffman)}` +
      ` = ${formatWon(segment.amountFloorWon)}`
    );
  });
}

/** 별지형 일실수입 계산표 (탭으로 칸을 나눈 행). 클립보드·PDF·CSV 공용. */
export function lostIncomeTableLines(result: AnyResult): string[] {
  const keepColumn = result.segments.some((s) => segmentKeep(result, s) !== undefined);
  const head = ["순번", "기간", "개월", "월 소득", "상실률", "호프만", "금액"];
  if (keepColumn) head.splice(5, 0, "생계비 공제 후");
  const rows = result.segments.map((segment, i) => {
    const row = [
      String(i + 1),
      segmentPeriod(segment),
      String(segment.endMonth - segment.startMonth),
      formatWon(segment.monthlyWageWon),
      percentText(segment.lossRate),
      hoffmanText(segment.appliedHoffman),
      formatWon(segment.amountFloorWon),
    ];
    if (keepColumn) row.splice(5, 0, segmentKeep(result, segment) ?? "");
    return row.join("\t");
  });
  const total = [
    "합계",
    ...head.slice(1, -1).map(() => ""),
    formatWon(result.lostIncomeSubtotalWon),
  ];
  return [head.join("\t"), ...rows, total.join("\t")];
}

/** 원고별 최종액 (라벨, 금액). 없으면 빈 배열. */
function claimantAmounts(result: AnyResult): [string, number][] {
  if ("claimants" in result && result.claimants !== undefined) {
    return result.claimants.map((c) => [injuryClaimantLabel(c), c.amountWon]);
  }
  if ("mode" in result && result.mode === "death") {
    return [...(result.inheritanceShares ?? []), ...(result.otherClaimants ?? [])].map((s) => [
      s.name,
      s.amountWon,
    ]);
  }
  return [];
}

function basicFactLine(input: DocumentInput, result: AnyResult): string {
  const { birthDate, accidentDate, sex } = input.base;
  const retirementAge = input.base.retirementAge ?? 65;
  const retirementEnd = addDays(addYears(birthDate, retirementAge), -1);
  const death = "mode" in result && result.mode === "death";
  return (
    `피해자는 ${formatCourtDate(birthDate)}생 ${sex === "male" ? "남자" : "여자"}이고, ` +
    `${formatCourtDate(accidentDate)} 사고${death ? "로 사망하였다" : "를 당하였다"}. ` +
    `사고 당시 만 ${ageAt(birthDate, accidentDate)}세이며, 가동연한은 만 ${retirementAge}세가 되기 전날인 ` +
    `${formatCourtDate(retirementEnd)}까지로 보았다.`
  );
}

/** 일실수입 밖의 재산상 손해 항목 (라벨, 금액). */
function otherPecuniaryItems(result: AnyResult): [string, number][] {
  const items: [string, number][] = [];
  if (result.lostRetirementSubtotalWon !== undefined) {
    items.push(["일실퇴직금", result.lostRetirementSubtotalWon]);
  }
  if (result.otherDamages !== undefined) {
    items.push(
      ["개호비", result.otherDamages.attendantCareWon],
      ["치료비", result.otherDamages.treatmentWon],
      ["보조구", result.otherDamages.applianceWon],
    );
  }
  if ("mode" in result && result.mode === "death") items.push(["장례비", result.funeralExpenseWon]);
  return items.filter(([, won]) => won > 0);
}

function deductionLine(result: AnyResult): string | undefined {
  const d = result.deductions;
  const total =
    d.ratioSubtotalWon +
    (d.paidTreatmentSubtotalWon ?? 0) +
    (d.legacyRatioSubtotalWon ?? 0) +
    d.absoluteSubtotalWon;
  if (total === 0) return undefined;
  return `공제 합계 ${formatWon(total)} (비율공제·지급치료비·전액공제 소계 합), 공제 후 ${formatWon(d.afterWon)}`;
}

function industrialLine(result: AnyResult): string | undefined {
  const b = result.industrialBenefit;
  if (b === undefined) return undefined;
  return `산재보험급여 ${formatWon(b.deductedWon)}을 과실상계 전에 일실수입에서 공제: ${formatWon(b.lostIncomeAfterWon)}`;
}

function responsibilityLine(result: AnyResult): string {
  const { ratio, beforeWon, afterWon } = result.faultOffset;
  return `피해자 과실 ${percentText(ratio)}, 피고 책임 ${percentText(1 - ratio)}: ${formatWon(beforeWon)} × ${percentText(1 - ratio)} = ${formatWon(afterWon)}`;
}

function buildMediationBlock(
  input: DocumentInput,
  result: AnyResult,
  mediationDate: string,
  scenarios: MediationScenarioRow[],
): DocumentTextBlock {
  const lines: string[] = ["1. 기초 사항", `  ${basicFactLine(input, result)}`];
  if (result.lifeExpectancy !== undefined) {
    lines.push(`  기대여명: ${lifeExpectancyText(result.lifeExpectancy)}`);
  }
  lines.push(
    "2. 재산상 손해",
    `  가. 일실수입 ${formatWon(result.lostIncomeSubtotalWon)}`,
    ...segmentFormulaLines(result).map((l) => `     ${l}`),
  );
  const industrial = industrialLine(result);
  if (industrial !== undefined) lines.push(`     ${industrial}`);
  otherPecuniaryItems(result).forEach(([label, won], i) => {
    lines.push(`  ${"나다라마바사"[i] ?? "-"}. ${label} ${formatWon(won)}`);
  });
  lines.push("3. 책임의 제한", `  ${responsibilityLine(result)}`);
  const deduction = deductionLine(result);
  let n = 4;
  if (deduction !== undefined) lines.push(`${n++}. 공제`, `  ${deduction}`);
  lines.push(`${n++}. 위자료 ${formatWon(result.solatiumWon)}`);
  lines.push(
    `${n}. 조정 금액 (괄호 안은 ${formatCourtDate(input.base.accidentDate)}부터 조정일 ${formatCourtDate(mediationDate)}까지 연 5% 이자를 더한 금액)`,
    ...scenarios.map(
      (s, i) =>
        `  책임 ${s.responsibilityPercent}%${i === 0 ? " (입력 기준)" : ""}: ${formatWon(s.finalWon)} (${formatWon(s.totalWon)})`,
    ),
  );
  const claimants = claimantAmounts(result);
  if (claimants.length > 0) {
    lines.push(
      `  책임 ${scenarios[0]?.responsibilityPercent ?? ""}% 원고별: ` +
        claimants.map(([label, won]) => `${label} ${formatWon(won)}`).join(", "),
    );
  }
  return { title: `조정안 형식 (조정일 ${formatCourtDate(mediationDate)})`, lines };
}

function buildJudgmentBlocks(
  input: DocumentInput,
  result: AnyResult,
  delay: DelayDamagesExport | undefined,
): DocumentTextBlock[] {
  const lines: string[] = ["가. 기초 사실", `  ${basicFactLine(input, result)}`];
  if (result.lifeExpectancy !== undefined) {
    lines.push(`  기대여명: ${lifeExpectancyText(result.lifeExpectancy)}`);
  }
  if ("combinedLossRate" in result) {
    lines.push(
      `  노동능력상실률은 ${percentText(result.combinedLossRate)}이다 (구간별 상실률은 별지 계산표).`,
    );
  } else {
    const ratio = result.livingCostDeductionRatio;
    lines.push(
      `  생계비 공제 비율: 수입의 ${Math.abs(ratio - 1 / 3) < 1e-12 ? "1/3" : percentText(ratio)}.`,
    );
  }
  lines.push(
    "나. 일실수입",
    `  사고 당시 현가(월 단위 호프만식)로 계산한 일실수입은 별지 일실수입 계산표와 같이 ${formatWon(result.lostIncomeSubtotalWon)}이다.`,
  );
  const industrial = industrialLine(result);
  if (industrial !== undefined) lines.push(`  ${industrial}`);
  const others = otherPecuniaryItems(result);
  if (others.length > 0) {
    lines.push(
      "다. 그 밖의 재산상 손해",
      ...others.map(([label, won]) => `  ${label} ${formatWon(won)}`),
    );
  }
  const { ratio, beforeWon, afterWon } = result.faultOffset;
  lines.push(
    "라. 책임의 제한",
    ratio === 0
      ? `  피해자의 과실을 인정하지 않으므로 책임을 제한하지 않는다. 피고 부담액은 재산상 손해 ${formatWon(afterWon)} 전액이다.`
      : `  피해자의 과실을 ${percentText(ratio)}로 보아 피고의 책임을 ${percentText(1 - ratio)}로 제한한다. ` +
          `재산상 손해 ${formatWon(beforeWon)} 중 피고 부담액은 ${formatWon(afterWon)}이다.`,
  );
  const deduction = deductionLine(result);
  if (deduction !== undefined) lines.push("마. 공제", `  ${deduction}`);
  lines.push("바. 위자료", `  ${formatWon(result.solatiumWon)}`, "사. 결론");
  const claimants = claimantAmounts(result);
  lines.push(
    claimants.length > 0
      ? `  피고가 지급할 손해배상금은 ${claimants.map(([label, won]) => `${label} ${formatWon(won)}`).join(", ")} (합계 ${formatWon(result.finalWon)})이다.`
      : `  피고가 지급할 손해배상금은 ${formatWon(result.finalWon)}이다.`,
  );
  if (delay !== undefined) {
    lines.push(
      ...delay.rows.map(
        (r) => `  지연손해금: ${r.label === "최종 합계" ? "" : `${r.label}에게 `}${r.orderText}`,
      ),
    );
  }
  return [
    { title: "판결 이유 형식 (손해배상의 범위)", lines },
    { title: "별지 일실수입 계산표", lines: lostIncomeTableLines(result) },
  ];
}

/**
 * 조정안·판결 이유 형식 문단. 조정안은 과실비율만 바꿔 `recompute` 로 엔진을 다시 돌려 시나리오 금액을
 * 내고, 사고일부터 조정일까지 연 5% 이자(지연손해금과 같은 기간식)를 더한 금액을 함께 적는다.
 * 입력이 모자라면 `error` 만 돌려준다.
 */
export function computeDocumentExport(
  state: DocumentFormState,
  input: DocumentInput,
  result: AnyResult,
  recompute: (faultRatio: number) => AnyResult,
  delay?: DelayDamagesExport,
): { value?: DocumentExport; error?: string } {
  if (!state.enabled) return {};
  if (state.format === "judgment") {
    return { value: { scenarios: [], blocks: buildJudgmentBlocks(input, result, delay) } };
  }
  if (!ISO_DATE.test(state.mediationDate)) return { error: "조정일을 입력하세요." };
  if (state.mediationDate < input.base.accidentDate) {
    return { error: "조정일은 사고일 이후여야 합니다." };
  }
  const spread = parseNumberText(state.spreadPercentText, { unit: "%", min: 0, max: 100 });
  if (spread.error !== undefined) return { error: `가감 폭: ${spread.error}` };
  try {
    const scenarios = mediationResponsibilityPercents(
      result.faultOffset.ratio,
      spread.value ?? MEDIATION_DEFAULT_SPREAD_PERCENT,
    ).map((pct, i) => {
      const finalWon =
        i === 0 ? result.finalWon : recompute(faultRatioOfResponsibilityPercent(pct)).finalWon;
      const interest = computeMediationInterest(
        finalWon,
        input.base.accidentDate,
        state.mediationDate,
      );
      return { responsibilityPercent: pct, finalWon, ...interest };
    });
    return {
      value: {
        scenarios,
        blocks: [
          buildMediationBlock(input, result, state.mediationDate, scenarios),
          { title: "별지 일실수입 계산표", lines: lostIncomeTableLines(result) },
        ],
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** 클립보드 문단 줄. */
export function documentClipboardLines(doc: DocumentExport | undefined): string[] {
  if (doc === undefined) return [];
  return doc.blocks.flatMap((b) => ["", b.title, ...b.lines]);
}
