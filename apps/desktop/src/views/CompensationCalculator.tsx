import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  FileDown,
  FileJson,
  FileSpreadsheet,
  Loader2,
  Plus,
  Scale,
  Trash2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { STANDARD_DISCLAIMER, calculateInheritance } from "@lawcalc-kr/core-engine";
import {
  computeCompensation,
  computeCompensationDeath,
  type CompensationAbsoluteDeduction,
  type CompensationAutoDeathInput,
  type CompensationAutoDeathResult,
  type CompensationDeductionsInput,
  type CompensationInput,
  type CompensationLegacyRatioDeduction,
  type CompensationResult,
  type CompensationSegment,
  type LaborRateEffectiveRule,
  type OtherDamagesResult,
  type PermanentDisabilityInput,
  type TemporaryDisabilityInput,
} from "@lawcalc-kr/compensation";
import {
  computeStaleBadge,
  findOccupationMerge,
  getLaborRateAt,
  laborRatesDatasetVersionTag,
  latestSliceEffectiveFrom,
  listOccupationsAt,
  loadLaborRatesTable,
  type StaleBadgeResult,
} from "@lawcalc-kr/datasets-compensation";

import {
  HEIR_GROUP_HINTS,
  HeirGroupCard,
  applyInheritanceInput,
  buildInheritanceInput,
  heirsForDirtySnapshot,
  type DecedentInput,
  type HeirInput,
  type SpouseInput,
} from "../components/inheritance-heirs";
import {
  OtherDamagesFormCard,
  applyOtherDamagesInput,
  buildOtherDamagesInput,
  defaultOtherDamagesFormState,
  otherDamagesForDirtySnapshot,
  type OtherDamagesFormState,
} from "../components/other-damages-form";
import { ResultFreshnessNotice } from "../components/result/ResultFreshnessNotice";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { useFormShortcuts } from "../hooks/use-form-shortcuts";
import { useResultFingerprint } from "../hooks/use-result-fingerprint";
import {
  buildCompensationExportWarnings,
  COURT_TRUNCATION_TEXT,
  HEIR_EXCESS_DROPPED_LABEL,
  HEIR_ROUNDING_LABEL,
  PROPERTY_ONLY_EXCESS_LABEL,
  deductionExcessLabel,
  laborRateTimingText,
  propertyOnlyExcessWon,
  type LaborRateTiming,
  solatiumSettlement,
  withCompensationExportWarnings,
} from "../lib/compensation-warnings";
import { formatWon, formatWonInput, parseWonAmount, parseWonText } from "../lib/format-won";
import { ipc, type LcalcCompensationPayload, type LcalcFile } from "../lib/ipc";
import { type CaseSlot, useCaseSlot } from "../lib/case-file";
import { createLcalcDirtySnapshot, useLcalcDirtyTracker } from "../lib/lcalc-dirty-state";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "../lib/lcalc-migrations";
import { parseLoadedCompensationLcalcInput, validateLcalcEnvelope } from "../lib/lcalc-validation";
import {
  FieldError,
  formatRatioText,
  parseNumberText,
  parseRatioText,
  readNumber,
} from "../lib/parse-number";
import { todayIso } from "../lib/today";

const APP_VERSION = __APP_VERSION__;

const DEFAULT_FUNERAL_EXPENSE = 5_000_000;

type ActionName = "pdf" | "csv" | "copy" | "save" | "load";

interface ToastState {
  type: "success" | "error";
  message: string;
}

export interface PermanentInputState {
  uid: string;
  department: string;
  ratioText: string;
}

export interface TemporaryInputState {
  uid: string;
  department: string;
  ratioText: string;
  yearsText: string;
}

/** 비율공제 (법원 방식): 항목 금액 × [1 - (1 - 기왕증)(1 - 과실)]. */
export interface RatioDeductionInputState {
  uid: string;
  label: string;
  amountText: string;
}

/** 구 비율공제 (이전 버전 파일 보존용): 과실상계 후 금액 × 비율. 새로 추가할 수 없다. */
export interface LegacyRatioDeductionInputState {
  uid: string;
  label: string;
  ratioText: string;
}

/** 부상·사망 공용 공제 입력. */
export interface DeductionsFormState {
  ratioDeductions: RatioDeductionInputState[];
  paidTreatmentDeductions: AbsoluteDeductionInputState[];
  absoluteDeductions: AbsoluteDeductionInputState[];
  legacyRatioDeductions: LegacyRatioDeductionInputState[];
}

/** 노임단가 시점 입력 (부상·사망 공용). */
export interface LaborRateTimingFormState {
  /** 계산 기준일 (변론종결 예정일). 새 입력 기본값 = 오늘. */
  calculationDate: string;
  laborRateEffectiveRule: LaborRateEffectiveRule;
}

export interface AbsoluteDeductionInputState {
  uid: string;
  label: string;
  amountText: string;
}

export interface CompensationFormState extends DeductionsFormState, LaborRateTimingFormState {
  accidentType: "auto" | "industrial";
  birthDate: string;
  accidentDate: string;
  treatmentEndDate: string;
  sex: "male" | "female";
  retirementAgeText: string;
  permanent: PermanentInputState[];
  temporary: TemporaryInputState[];
  priorImpairmentRatioText: string;
  occupation: string;
  directWageWonText: string;
  workingDaysPerMonthText: string;
  solatiumWonText: string;
  faultRatioText: string;
  /** 보험약관 지급기준: 위자료에도 과실상계 적용. 기본 꺼짐 (판결 실무). */
  applyFaultToSolatium: boolean;
  /** 입원기간(사고일 ~ 입원치료 종료일) 노동능력상실률 100%. 기본 켜짐. */
  hospitalizationFullLoss: boolean;
  /** 법원 계산 프로그램 방식 절사 (상실률 % 2자리, 호프만 4자리). 기본 꺼짐. */
  courtTruncation: boolean;
  /** 산재(산×부상) 장해급여 (원). accidentType === "industrial" 일 때만 적용. */
  disabilityBenefitWonText: string;
  /** 기타손해 (개호비·치료비·보조구). 미입력 시 결과 회귀 0. */
  otherDamages: OtherDamagesFormState;
}

const DEFAULT_OCCUPATION = "보통인부";
const DEFAULT_RETIREMENT_AGE = 65;
const DEFAULT_WORKING_DAYS = 20;

const LABOR_RATES_DATASET = loadLaborRatesTable();
const LABOR_RATES_VERSION_TAG = laborRatesDatasetVersionTag(LABOR_RATES_DATASET);
const LATEST_LABOR_RATES_SLICE = latestSliceEffectiveFrom(LABOR_RATES_DATASET);
const LABOR_RATES_SNAPSHOT_DATE = LABOR_RATES_DATASET.snapshotDate;
/**
 * 사고일 기준으로 고를 수 있는 직종 목록.
 *
 * 노임단가 슬라이스가 2026년 상반기 하나뿐이던 동안에는 "최신 슬라이스" 가 곧 정답이었다.
 * 1991년부터 반기별로 들어오면서 그 전제가 깨졌다. 사고일이 2005년인데 2026년 직종을
 * 보여 주면, 그때 없던 직종(창호공)은 고를 수 있고 그때 있던 직종(갱부)은 안 보인다.
 */
export interface OccupationOption {
  value: string;
  /** 그 사고일 회차에 조사된 직종인지. false 면 고를 수는 있어도 단가가 없다. */
  available: boolean;
}

export function occupationOptionsAt(accidentDate: string, selected?: string): OccupationOption[] {
  const list = listOccupationsAt(LABOR_RATES_DATASET, accidentDate).sort((a, b) =>
    a.localeCompare(b, "ko-KR"),
  );
  if (list.length > 0 && !list.includes(DEFAULT_OCCUPATION)) {
    list.unshift(DEFAULT_OCCUPATION);
  }
  const options: OccupationOption[] = (list.length > 0 ? list : [DEFAULT_OCCUPATION]).map(
    (value) => ({ value, available: true }),
  );
  // 이미 고른 직종이 이 회차 목록에 없으면 목록에 남겨 둔다. 빼 버리면 <select> 가 값을
  // 찾지 못해 첫 옵션을 대신 보여 주고, 화면에 보이는 직종과 실제 계산에 쓰이는 직종이
  // 어긋난다 (사고일만 바꿨을 뿐인데 갱부가 건설기계운전사로 보이던 문제).
  if (selected && !options.some((o) => o.value === selected)) {
    options.unshift({ value: selected, available: false });
  }
  return options;
}

/**
 * 받침 유무에 따른 조사. 안내 문구가 `"갱부"은 ... 특별인부(으)로` 처럼 나오지 않게 한다.
 */
function josa(word: string, kind: "은는" | "으로"): string {
  // 따옴표로 감싼 뒤 판정하면 마지막 글자가 따옴표라 항상 받침 없음으로 나온다.
  // 반드시 낱말 자체를 넘긴다.
  const last = word.trim().at(-1) ?? "";
  const code = last.charCodeAt(0);
  const isHangul = code >= 0xac00 && code <= 0xd7a3;
  const jong = isHangul ? (code - 0xac00) % 28 : -1;
  if (kind === "은는") {
    // 한글이 아니면(영문·기호로 끝나는 직종명) 판정할 수 없으므로 "는" 으로 둔다.
    return jong > 0 ? "은" : "는";
  }
  // ㄹ 받침(jong === 8)은 "로" 를 쓴다.
  return jong > 0 && jong !== 8 ? "으로" : "로";
}

/**
 * 고른 직종을 그 사고일에 조회할 수 없을 때 화면에 띄울 안내.
 *
 * 통합으로 사라진 직종이면 어디로 흡수됐는지 알려 준다. 단가를 대신 계산해 주지는 않는다.
 */
export function occupationHintAt(occupation: string, accidentDate: string): string | null {
  if (!occupation || !ISO_DATE.test(accidentDate)) {
    return null;
  }
  if (getLaborRateAt(LABOR_RATES_DATASET, occupation, accidentDate) !== undefined) {
    return null;
  }
  const merge = findOccupationMerge(LABOR_RATES_DATASET, occupation);
  if (merge && accidentDate >= merge.effectiveFrom) {
    const into = merge.mergedInto.join(" · ");
    const lastInto = merge.mergedInto.at(-1) ?? into;
    return (
      `"${occupation}"${josa(occupation, "은는")} ${merge.effectiveFrom} 공표분부터 ` +
      `${into}${josa(lastInto, "으로")} 통합되어 이 사고일에는 단가가 공표되지 않았습니다. ` +
      "통합된 직종을 고르거나 일당을 직접 입력하세요."
    );
  }
  return `"${occupation}"${josa(occupation, "은는")} 이 사고일 기준 노임단가에 없습니다. 일당을 직접 입력하세요.`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function newUid(): string {
  return crypto.randomUUID();
}

function readRatio(label: string, text: string): number | undefined {
  return readNumber(label, parseRatioText(text));
}

const RETIREMENT_AGE_FORMAT = { unit: "세", integer: true, min: 1, max: 120 } as const;
const WORKING_DAYS_FORMAT = { unit: "일", integer: true, min: 1, max: 31 } as const;
const YEARS_FORMAT = { unit: "년" } as const;

function readRetirementAndWorkingDays(state: {
  retirementAgeText: string;
  workingDaysPerMonthText: string;
}): { retirementAge: number; workingDaysPerMonth: number } {
  return {
    retirementAge:
      readNumber("가동연한", parseNumberText(state.retirementAgeText, RETIREMENT_AGE_FORMAT)) ??
      DEFAULT_RETIREMENT_AGE,
    workingDaysPerMonth:
      readNumber(
        "월 가동일수",
        parseNumberText(state.workingDaysPerMonthText, WORKING_DAYS_FORMAT),
      ) ?? DEFAULT_WORKING_DAYS,
  };
}

export function emptyPermanent(): PermanentInputState {
  return { uid: newUid(), department: "", ratioText: "" };
}

export function emptyTemporary(): TemporaryInputState {
  return { uid: newUid(), department: "", ratioText: "", yearsText: "" };
}

export function emptyRatioDeduction(): RatioDeductionInputState {
  return { uid: newUid(), label: "", amountText: "" };
}

export function emptyAbsoluteDeduction(): AbsoluteDeductionInputState {
  return { uid: newUid(), label: "", amountText: "" };
}

/** 새 입력의 노임 적용일 규약. 판결 계산표·법원 계산 프로그램 예시가 조사 시점이다 (원장 결정 2). */
const DEFAULT_LABOR_RATE_RULE: LaborRateEffectiveRule = "survey";

function defaultLaborRateTiming(): LaborRateTimingFormState {
  return { calculationDate: todayIso(), laborRateEffectiveRule: DEFAULT_LABOR_RATE_RULE };
}

function readLaborRateTiming(state: LaborRateTimingFormState & { accidentDate: string }) {
  if (!ISO_DATE.test(state.calculationDate)) throw new Error("계산 기준일을 입력하세요.");
  if (ISO_DATE.test(state.accidentDate) && state.calculationDate < state.accidentDate) {
    throw new Error("계산 기준일은 사고일과 같거나 그 뒤여야 합니다.");
  }
  return {
    calculationDate: state.calculationDate,
    laborRateEffectiveRule: state.laborRateEffectiveRule,
  };
}

/**
 * 불러온 파일의 노임 시점 입력. 기준일이 없는 이전 버전 파일은 기준일을 사고일로 둔다.
 * 기준일 = 사고일이면 분할할 노임 변경이 없어 기준일 없음과 금액이 같고, 다시 저장하면
 * 기준일이 명시된다.
 */
function applyLaborRateTiming(base: {
  accidentDate: string;
  calculationDate?: string;
  laborRateEffectiveRule?: LaborRateEffectiveRule;
}): LaborRateTimingFormState {
  return {
    calculationDate: base.calculationDate ?? base.accidentDate,
    laborRateEffectiveRule: base.laborRateEffectiveRule ?? "published",
  };
}

/**
 * 이전 버전 파일 안내. 기준일이 없거나 구 비율공제가 있으면 저장 당시 금액대로 연 방식과
 * 새 방식으로 바꾸는 법을 알린다. 해당 없으면 null.
 */
export function legacyCompensationNotice(input: {
  base: { calculationDate?: string; laborRateEffectiveRule?: LaborRateEffectiveRule };
  deductions?: CompensationDeductionsInput;
}): string | null {
  const noDate = input.base.calculationDate === undefined;
  const legacyRatio = (input.deductions?.legacyRatio?.length ?? 0) > 0;
  if (!noDate && !legacyRatio) return null;
  const opened: string[] = [];
  const howTo: string[] = [];
  if (noDate) {
    const rule =
      input.base.laborRateEffectiveRule === "survey"
        ? "조사 시점(5/1·9/1)"
        : "공표 적용일(1/1·9/1)";
    opened.push(`노임단가는 ${rule} 규약, 계산 기준일은 사고일(사고일 단가 하나로 계산)`);
    howTo.push("계산 기준일을 변론종결 예정일로 바꾸고 노임 적용일 규약을 고르세요");
  }
  if (legacyRatio) {
    opened.push("비율공제는 이전 방식(과실상계 후 금액 × 비율)");
    howTo.push("이전 방식 비율공제를 지우고 공제할 항목 금액을 비율공제 칸에 넣으세요");
  }
  // 금액이 저장 당시와 같다고 약속하지 않는다. 다른 산식 변경으로 금액이 달라지면 결과 안내
  // (`useResultFingerprint`)가 저장 당시 금액과 함께 따로 알린다.
  return `이전 버전 파일이라 ${opened.join(", ")}으로, 저장 당시 방식대로 열었습니다. 새 방식으로 바꾸려면 ${howTo.join(", ")}.`;
}

function defaultDeductionsFormState(): DeductionsFormState {
  return {
    ratioDeductions: [],
    paidTreatmentDeductions: [],
    absoluteDeductions: [],
    legacyRatioDeductions: [],
  };
}

function readAmountItems(
  items: readonly { label: string; amountText: string }[],
): CompensationAbsoluteDeduction[] {
  return items
    .map((item) => {
      const node: CompensationAbsoluteDeduction = { amount: parseWonAmount(item.amountText, 0) };
      const label = item.label.trim();
      if (label.length > 0) node.label = label;
      return node;
    })
    .filter((item) => item.amount > 0);
}

/**
 * 결과를 낸 노임 시점 입력. 내보내기는 결과가 최신일 때(입력 지문 일치)만 되므로 지금
 * 화면 입력이 곧 결과의 입력이다.
 */
function timingOf(
  state: LaborRateTimingFormState & { courtTruncation?: boolean },
): LaborRateTiming {
  return {
    calculationDate: state.calculationDate,
    laborRateEffectiveRule: state.laborRateEffectiveRule,
    ...(state.courtTruncation ? { courtTruncation: true } : {}),
  };
}

/** 공제 입력. 빈 항목은 빼고, 하나도 없으면 undefined (키 생략). */
export function buildDeductionsInput(
  state: DeductionsFormState,
): CompensationDeductionsInput | undefined {
  const legacyRatio: CompensationLegacyRatioDeduction[] = state.legacyRatioDeductions
    .map((item, i) => {
      const node: CompensationLegacyRatioDeduction = {
        ratio: readRatio(`이전 방식 비율공제 ${i + 1}번째 비율`, item.ratioText) ?? 0,
      };
      const label = item.label.trim();
      if (label.length > 0) node.label = label;
      return node;
    })
    .filter((item) => item.ratio > 0);
  const lists = {
    ratio: readAmountItems(state.ratioDeductions),
    paidTreatment: readAmountItems(state.paidTreatmentDeductions),
    absolute: readAmountItems(state.absoluteDeductions),
  };
  const deductions: CompensationDeductionsInput = {};
  if (lists.ratio.length > 0) deductions.ratio = lists.ratio;
  if (lists.paidTreatment.length > 0) deductions.paidTreatment = lists.paidTreatment;
  if (lists.absolute.length > 0) deductions.absolute = lists.absolute;
  if (legacyRatio.length > 0) deductions.legacyRatio = legacyRatio;
  return Object.keys(deductions).length > 0 ? deductions : undefined;
}

function applyDeductionsInput(
  deductions: CompensationDeductionsInput | undefined,
): DeductionsFormState {
  const amountRows = (items: readonly { label?: string; amount: number }[] | undefined) =>
    (items ?? []).map((item) => ({
      uid: newUid(),
      label: item.label ?? "",
      amountText: String(item.amount),
    }));
  return {
    ratioDeductions: amountRows(deductions?.ratio),
    paidTreatmentDeductions: amountRows(deductions?.paidTreatment),
    absoluteDeductions: amountRows(deductions?.absolute),
    legacyRatioDeductions: (deductions?.legacyRatio ?? []).map((item) => ({
      uid: newUid(),
      label: item.label ?? "",
      ratioText: formatRatioText(item.ratio),
    })),
  };
}

function deductionsForDirtySnapshot(state: DeductionsFormState) {
  const amountRows = (items: readonly AbsoluteDeductionInputState[]) =>
    items.map((item) => ({ label: item.label, amountText: item.amountText }));
  return {
    ratioDeductions: amountRows(state.ratioDeductions),
    paidTreatmentDeductions: amountRows(state.paidTreatmentDeductions),
    absoluteDeductions: amountRows(state.absoluteDeductions),
    legacyRatioDeductions: state.legacyRatioDeductions.map((item) => ({
      label: item.label,
      ratioText: item.ratioText,
    })),
  };
}

export function defaultCompensationFormState(): CompensationFormState {
  return {
    accidentType: "auto",
    birthDate: "1996-01-01",
    accidentDate: "2026-01-01",
    treatmentEndDate: "2026-01-01",
    sex: "male",
    retirementAgeText: String(DEFAULT_RETIREMENT_AGE),
    permanent: [{ uid: newUid(), department: "정형외과", ratioText: "0.30" }],
    temporary: [],
    priorImpairmentRatioText: "",
    occupation: DEFAULT_OCCUPATION,
    directWageWonText: "",
    workingDaysPerMonthText: String(DEFAULT_WORKING_DAYS),
    solatiumWonText: "",
    faultRatioText: "",
    applyFaultToSolatium: false,
    hospitalizationFullLoss: true,
    courtTruncation: false,
    ...defaultLaborRateTiming(),
    ...defaultDeductionsFormState(),
    disabilityBenefitWonText: "",
    otherDamages: defaultOtherDamagesFormState(),
  };
}

export function buildCompensationInput(state: CompensationFormState): CompensationInput {
  const permanent: PermanentDisabilityInput[] = state.permanent
    .map((item, i) => {
      const ratio = readRatio(`영구장해 ${i + 1}번째 비율`, item.ratioText) ?? 0;
      const node: PermanentDisabilityInput = { ratio };
      const department = item.department.trim();
      if (department.length > 0) node.department = department;
      return node;
    })
    .filter((item) => item.ratio > 0);

  const temporary: TemporaryDisabilityInput[] = state.temporary
    .map((item, i) => {
      const ratio = readRatio(`한시장해 ${i + 1}번째 비율`, item.ratioText) ?? 0;
      const yearsLabel = `한시장해 ${i + 1}번째 년수`;
      const years = readNumber(yearsLabel, parseNumberText(item.yearsText, YEARS_FORMAT)) ?? 0;
      // 비율만 넣고 년수를 비우면 행이 소리 없이 빠져 장해가 사라진다.
      if (ratio > 0 && years === 0) throw new Error(`${yearsLabel}: 0보다 큰 년수를 입력하세요.`);
      const node: TemporaryDisabilityInput = { ratio, years };
      const department = item.department.trim();
      if (department.length > 0) node.department = department;
      return node;
    })
    .filter((item) => item.ratio > 0);

  const { retirementAge, workingDaysPerMonth } = readRetirementAndWorkingDays(state);

  const occupation = state.occupation.trim();
  const directWageWon = parseWonAmount(state.directWageWonText, 0);
  const lostIncome: CompensationInput["lostIncome"] = {
    discountMethod: "hoffman",
    workingDaysPerMonth,
  };
  if (occupation.length > 0) lostIncome.occupation = occupation;
  if (directWageWon > 0) lostIncome.directWageWon = directWageWon;

  const lossRate: CompensationInput["lossRate"] = {};
  if (permanent.length > 0) lossRate.permanent = permanent;
  if (temporary.length > 0) lossRate.temporary = temporary;
  const priorImpairment = readRatio("기왕증 기여도", state.priorImpairmentRatioText) ?? 0;
  if (priorImpairment > 0) lossRate.priorImpairmentRatio = priorImpairment;
  // 늘 명시한다. 키가 없는 파일은 이 토글이 없던 이전 버전 파일이라 "끔" 으로 연다
  // (`applyLoadedCompensationInput`). 엔진 API 는 키 없음 = 적용이지만 화면은 구분해야 한다.
  lossRate.hospitalizationFullLoss = state.hospitalizationFullLoss;

  const input: CompensationInput = {
    base: {
      birthDate: state.birthDate,
      accidentDate: state.accidentDate,
      treatmentEndDate: state.treatmentEndDate,
      sex: state.sex,
      retirementAge,
      legalRatePreset: "civil",
      // 늘 명시한다. 기준일이 없는 파일은 이전 버전 파일로 보고 안내한다.
      ...readLaborRateTiming(state),
    },
    lossRate,
    lostIncome,
  };
  // 끈 상태는 키를 두지 않는다. 키 없음 = 종전 계산이라 이 옵션이 없던 파일과 같다.
  if (state.courtTruncation) input.base.courtTruncation = true;

  const solatium = parseWonAmount(state.solatiumWonText, 0);
  if (solatium > 0) input.solatiumWon = solatium;
  const fault = readRatio("과실비율", state.faultRatioText) ?? 0;
  if (fault > 0) input.faultRatio = fault;
  if (state.applyFaultToSolatium) input.applyFaultToSolatium = true;
  const deductions = buildDeductionsInput(state);
  if (deductions) input.deductions = deductions;
  if (state.accidentType === "industrial") {
    input.accidentType = "industrial";
    const disability = parseWonAmount(state.disabilityBenefitWonText, 0);
    if (disability > 0) input.industrialInsurance = { disabilityBenefitWon: disability };
  }
  const otherDamages = buildOtherDamagesInput(state.otherDamages);
  if (otherDamages) input.otherDamages = otherDamages;

  return input;
}

export function applyLoadedCompensationInput(input: CompensationInput): CompensationFormState {
  return {
    accidentType: input.accidentType ?? "auto",
    birthDate: input.base.birthDate,
    accidentDate: input.base.accidentDate,
    treatmentEndDate: input.base.treatmentEndDate,
    sex: input.base.sex,
    retirementAgeText: String(input.base.retirementAge ?? DEFAULT_RETIREMENT_AGE),
    permanent: (input.lossRate.permanent ?? []).map((item) => ({
      uid: newUid(),
      department: item.department ?? "",
      ratioText: formatRatioText(item.ratio),
    })),
    temporary: (input.lossRate.temporary ?? []).map((item) => ({
      uid: newUid(),
      department: item.department ?? "",
      ratioText: formatRatioText(item.ratio),
      yearsText: String(item.years),
    })),
    priorImpairmentRatioText:
      input.lossRate.priorImpairmentRatio === undefined
        ? ""
        : formatRatioText(input.lossRate.priorImpairmentRatio),
    occupation: input.lostIncome.occupation ?? "",
    directWageWonText:
      input.lostIncome.directWageWon === undefined ? "" : String(input.lostIncome.directWageWon),
    workingDaysPerMonthText: String(input.lostIncome.workingDaysPerMonth ?? DEFAULT_WORKING_DAYS),
    solatiumWonText: input.solatiumWon === undefined ? "" : String(input.solatiumWon),
    faultRatioText: input.faultRatio === undefined ? "" : formatRatioText(input.faultRatio),
    applyFaultToSolatium: input.applyFaultToSolatium === true,
    // 키가 없으면 이 토글이 없던 이전 버전 파일이다. 그때는 입원기간도 장해율로 계산했으므로
    // 끈 상태로 연다 (화면이 안내를 띄운다).
    hospitalizationFullLoss: input.lossRate.hospitalizationFullLoss === true,
    courtTruncation: input.base.courtTruncation === true,
    ...applyLaborRateTiming(input.base),
    ...applyDeductionsInput(input.deductions),
    disabilityBenefitWonText:
      input.industrialInsurance?.disabilityBenefitWon === undefined
        ? ""
        : String(input.industrialInsurance.disabilityBenefitWon),
    otherDamages: applyOtherDamagesInput(input.otherDamages),
  };
}

/**
 * 위자료 가산·공제 초과분 (라벨, 금액) 행. 화면 카드와 클립보드가 같이 쓴다.
 * 공제가 재산상 손해를 넘으면 "공제 후 재산상 손해 0원 → 공제 초과분 → 위자료 가산" 순으로
 * 보여, 이 행들의 합이 최종액(100원 미만 버림 전)과 맞는다. 상속인별(수급권자별) 계산은
 * 버린 초과분과 상속분 절사 차이 행을 더해 최종액과 원 단위로 맞춘다.
 */
function solatiumSettlementRows(
  result: CompensationResult | CompensationAutoDeathResult,
): [string, string][] {
  const settlement = solatiumSettlement(result);
  const rows: [string, string][] = [];
  if (settlement.deductionExcessWon > 0) {
    rows.push(
      ["공제 후 재산상 손해", formatWon(0)],
      [deductionExcessLabel(settlement), formatWon(-settlement.deductionExcessWon)],
    );
  }
  if (settlement.heirExcessDroppedWon > 0) {
    rows.push([HEIR_EXCESS_DROPPED_LABEL, formatWon(settlement.heirExcessDroppedWon)]);
  }
  if (settlement.addedWon > 0) rows.push(["위자료 가산", formatWon(settlement.addedWon)]);
  if (settlement.heirRoundingWon > 0) {
    rows.push([HEIR_ROUNDING_LABEL, formatWon(-settlement.heirRoundingWon)]);
  }
  return rows;
}

/**
 * 공제 (라벨, 금액) 행. 화면 카드와 클립보드가 같이 쓴다. 과실상계 후 금액에서 이 행들
 * (소계는 빼고, 재산상 손해 초과분은 되돌림)을 계산하면 엔진의 공제 후 금액이 된다.
 */
function deductionRows(
  result: CompensationResult | CompensationAutoDeathResult,
): [string, string][] {
  const d = result.deductions;
  const rows: [string, string][] = [["비율공제 소계", formatWon(d.ratioSubtotalWon)]];
  if (d.paidTreatmentSubtotalWon !== undefined) {
    rows.push(["지급치료비 공제 소계", formatWon(d.paidTreatmentSubtotalWon)]);
  }
  if (d.legacyRatioSubtotalWon !== undefined) {
    rows.push(["이전 방식 비율공제 소계", formatWon(d.legacyRatioSubtotalWon)]);
  }
  // 상속인별 계산은 이 두 금액이 상속인별 몫(원 미만 버림)의 합이라 그 사실을 붙인다.
  const heirSuffix = d.roundingWon !== undefined ? HEIR_SHARE_FLOOR_SUFFIX : "";
  rows.push([`전액공제 소계${heirSuffix}`, formatWon(d.absoluteSubtotalWon)]);
  const excess = propertyOnlyExcessWon(result);
  if (excess > 0) rows.push([`${PROPERTY_ONLY_EXCESS_LABEL}${heirSuffix}`, formatWon(excess)]);
  return rows;
}

/** 구간 기간 표기. 계산 기준일을 넣은 결과는 초일·말일을 함께 적는다. */
function segmentPeriodText(segment: CompensationSegment): string {
  const months = `${segment.startMonth}~${segment.endMonth}개월`;
  return segment.startDate !== undefined
    ? `${months} (${segment.startDate} ~ ${segment.endDate ?? ""})`
    : months;
}

function hospitalizationLine(months: number): string {
  return `입원기간 ${months}개월 상실률 100% (월 단위 내림)`;
}

/**
 * 입원기간 상실률 100% 를 적용한 개월 수. 결과의 앞쪽 상실률 1 구간이 끝나는 달이다
 * (엔진은 입원 종료월을 구간 경계로 두고 그 앞 구간을 상실률 1 로 계산한다). 입력이 아니라
 * 결과에서 구해, 계산 뒤 입력을 바꿔도 표시가 계산 당시와 어긋나지 않는다.
 *
 * 장해율 자체가 100% 인 결과(`combinedLossRate` 1)는 입원 구간을 구별할 수 없고 전 기간이
 * 100% 라 0 으로 둔다. 입원 100% 를 끄면 장해율이 100% 미만인 한 상실률 1 구간이 없어 0 이다.
 */
export function hospitalizationMonthsOf(result: CompensationResult): number {
  if (result.combinedLossRate >= 1) return 0;
  let months = 0;
  for (const segment of result.segments) {
    if (segment.lossRate !== 1) break;
    months = segment.endMonth;
  }
  return months;
}

/**
 * 사고일을 바꾼다. 입원치료 종료일을 사용자가 따로 고치지 않았으면(= 사고일과 같으면)
 * 함께 옮긴다. 기본값 종료일이 옛 사고일에 남아 그 사이 전체가 상실률 100% 로 계산되는
 * 일을 막는다.
 */
export function withAccidentDate<
  T extends { accidentDate: string; calculationDate: string; treatmentEndDate?: string },
>(state: T, accidentDate: string): T {
  // 사고일과 같던 날짜(따로 고치지 않은 종료일, 이전 버전 파일의 기준일)만 따라간다.
  const follow = (date: string) => (date === state.accidentDate ? accidentDate : date);
  return {
    ...state,
    accidentDate,
    calculationDate: follow(state.calculationDate),
    ...(state.treatmentEndDate !== undefined
      ? { treatmentEndDate: follow(state.treatmentEndDate) }
      : {}),
  };
}

function formatRatioPercent(value: number): string {
  return `${(value * 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
}

function formatComputedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function stateForDirtySnapshot(state: CompensationFormState) {
  return {
    accidentType: state.accidentType,
    disabilityBenefitWonText: state.disabilityBenefitWonText,
    birthDate: state.birthDate,
    accidentDate: state.accidentDate,
    treatmentEndDate: state.treatmentEndDate,
    sex: state.sex,
    retirementAgeText: state.retirementAgeText,
    permanent: state.permanent.map((item) => ({
      department: item.department,
      ratioText: item.ratioText,
    })),
    temporary: state.temporary.map((item) => ({
      department: item.department,
      ratioText: item.ratioText,
      yearsText: item.yearsText,
    })),
    priorImpairmentRatioText: state.priorImpairmentRatioText,
    hospitalizationFullLoss: state.hospitalizationFullLoss,
    courtTruncation: state.courtTruncation,
    occupation: state.occupation,
    directWageWonText: state.directWageWonText,
    workingDaysPerMonthText: state.workingDaysPerMonthText,
    solatiumWonText: state.solatiumWonText,
    faultRatioText: state.faultRatioText,
    applyFaultToSolatium: state.applyFaultToSolatium,
    calculationDate: state.calculationDate,
    laborRateEffectiveRule: state.laborRateEffectiveRule,
    ...deductionsForDirtySnapshot(state),
    otherDamages: otherDamagesForDirtySnapshot(state.otherDamages),
  };
}

function buildCompensationDirtySnapshot(state: CompensationFormState, note: string) {
  return createLcalcDirtySnapshot({ state: stateForDirtySnapshot(state), note });
}

/**
 * 산재보험급여 공제 클립보드 줄 (일실수입 한도 선공제 — 2021다241618 전합). 부상·사망 공용.
 */
function buildIndustrialBenefitLines(
  industrialBenefit: NonNullable<CompensationResult["industrialBenefit"]>,
  benefitLabel: "장해급여·휴업급여" | "유족급여",
): string[] {
  const capSuffix =
    industrialBenefit.deductedWon < industrialBenefit.benefitWon
      ? ` (급여 ${formatWon(industrialBenefit.benefitWon)} 중 일실수입 한도)`
      : "";
  return [
    `산재보험급여 공제 (${benefitLabel}): ${formatWon(industrialBenefit.deductedWon)}${capSuffix}`,
    `공제 후 일실수입: ${formatWon(industrialBenefit.lostIncomeAfterWon)}`,
  ];
}

/** 클립보드용 경고 블록. 화면·PDF·CSV 와 같은 문구를 쓴다 (단일 출처). */
function clipboardWarningLines(result: CompensationResult | CompensationAutoDeathResult): string[] {
  const warnings = buildCompensationExportWarnings(result);
  if (warnings.length === 0) return [];
  return ["", "확인이 필요한 사항", ...warnings.map((w) => `- ${w}`)];
}

export function formatCompensationForClipboard(
  result: CompensationResult,
  hospitalMonths = 0,
  timing?: LaborRateTiming,
): string {
  const segmentRows = result.segments
    .map(
      (segment, i) =>
        `${i + 1}\t${segmentPeriodText(segment)}\t${formatRatioPercent(segment.lossRate)}\t${formatWon(segment.dailyWageWon)}/일\t호프만 ${segment.appliedHoffman.toFixed(
          6,
        )}\t${formatWon(segment.amountFloorWon)}`,
    )
    .join("\n");

  const lines: string[] = [
    result.accidentType === "industrial"
      ? "LawCalc Korea 산재 사고 부상 손해배상 계산 결과"
      : "LawCalc Korea 자동차 사고 부상 손해배상 계산 결과",
    ...(timing ? [`노임 기준: ${laborRateTimingText(timing)}`] : []),
    ...(timing?.courtTruncation ? [`절사: ${COURT_TRUNCATION_TEXT}`] : []),
    `중복장해율: ${formatRatioPercent(result.combinedLossRate)}`,
    ...(hospitalMonths > 0 ? [hospitalizationLine(hospitalMonths)] : []),
    `일실수입 소계: ${formatWon(result.lostIncomeSubtotalWon)}`,
  ];
  if (result.industrialBenefit !== undefined) {
    lines.push(...buildIndustrialBenefitLines(result.industrialBenefit, "장해급여·휴업급여"));
  }
  lines.push(
    `위자료: ${formatWon(result.solatiumWon)}`,
    `과실상계 대상 소계: ${formatWon(result.pecuniaryDamagesSubtotalWon)}`,
    `과실상계 (${formatRatioPercent(result.faultOffset.ratio)} 후): ${formatWon(result.faultOffset.afterWon)}`,
    ...deductionRows(result).map(([label, value]) => `${label}: ${value}`),
  );
  if (result.deductions.industrialBenefitWon !== undefined) {
    // legacy — ≤ v0.9.x 로 저장된 .lcalc 결과(과실상계 후 총액 공제)를 그대로 표시.
    lines.push(
      `산재보험급여 공제 (장해급여): ${formatWon(result.deductions.industrialBenefitWon)}`,
    );
  }
  for (const [label, value] of solatiumSettlementRows(result)) lines.push(`${label}: ${value}`);
  if (result.otherDamages !== undefined) {
    lines.push(
      `개호비: ${formatWon(result.otherDamages.attendantCareWon)}`,
      `치료비: ${formatWon(result.otherDamages.treatmentWon)}`,
      `보조구: ${formatWon(result.otherDamages.applianceWon)}`,
      `기타손해 소계: ${formatWon(result.otherDamages.subtotalWon)}`,
    );
  }
  lines.push(
    `최종 합계: ${formatWon(result.finalWon)}`,
    `데이터 버전: laborRates=${result.dataVersions.laborRates} / lifeExpectancy=${result.dataVersions.lifeExpectancy} / hoffman=${result.dataVersions.hoffman} / leibniz=${result.dataVersions.leibniz}`,
    `계산 시각: ${result.computedAt}`,
    "",
    "구간\t기간\t상실률\t단가\t호프만(적용)\t금액",
    segmentRows,
  );
  lines.push(...clipboardWarningLines(result));
  lines.push("", STANDARD_DISCLAIMER);
  return lines.join("\n");
}

export function buildCompensationLcalcFile(
  input: CompensationInput,
  result: CompensationResult,
  note: string,
): LcalcFile {
  const payload: LcalcCompensationPayload = {
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    input,
    result: { ...result, disclaimer: STANDARD_DISCLAIMER },
    disclaimer: STANDARD_DISCLAIMER,
  };
  if (note.trim()) payload.note = note.trim();
  return {
    schemaVersion: CURRENT_LCALC_SCHEMA_VERSION,
    kind: "compensation",
    // 새 저장은 계산 기준일·노임 적용일 규약을 늘 담으므로 @5 다. 이전 앱은 이 키를 모르고
    // 사고일 단가 하나로 계산하므로 업데이트를 요구해야 한다.
    envelopeFeatures: ["compensation@5"],
    dataVersions: {
      laborRates: result.dataVersions.laborRates,
      lifeExpectancy: result.dataVersions.lifeExpectancy,
      hoffman: result.dataVersions.hoffman,
      leibniz: result.dataVersions.leibniz,
    },
    payload,
  };
}

/**
 * 유족급여 수급권자 1명. `heirName` 이 `NON_HEIR_RECIPIENT` 면 상속인 아닌 수급권자(공제 없음),
 * "" 면 아직 고르지 않은 것(계산 시 오류).
 */
export interface SurvivorRecipientInputState {
  uid: string;
  heirName: string;
  amountText: string;
}

export function emptySurvivorRecipient(): SurvivorRecipientInputState {
  return { uid: newUid(), heirName: "", amountText: "" };
}

/** 상속인별(수급권자별) 계산의 공제 행 라벨 꼬리 (Rust `HEIR_SHARE_FLOOR_SUFFIX` 와 같다). */
const HEIR_SHARE_FLOOR_SUFFIX = " (상속분 원 미만 버림 포함)";

/** 고른 수급권자가 지금 상속인 목록에 없으면 칸 오류 문구, 아니면 undefined. */
function recipientHeirError(heirName: string, heirNames: readonly string[]): string | undefined {
  return heirName.length > 0 && heirName !== NON_HEIR_RECIPIENT && !heirNames.includes(heirName)
    ? `"${heirName}"은(는) 지금 상속인 목록에 없습니다. 상속인을 다시 고르세요.`
    : undefined;
}

/**
 * 지금 상속인 입력으로 나오는 상속인 이름 (중복 포함, 엔진이 이름으로 맞춘다). 상속인 입력이
 * 잘못됐으면 빈 목록.
 */
function heirNamesOf(state: CompensationDeathFormState): string[] {
  if (!state.includeHeirs) return [];
  try {
    return calculateInheritance(
      buildInheritanceInput({
        decedent: state.decedent,
        spouse: state.spouse,
        linealDescendants: state.linealDescendants,
        linealAscendants: state.linealAscendants,
        siblings: state.siblings,
        collateralFourth: state.collateralFourth,
      }),
    ).shares.map((share) => share.name);
  } catch {
    return [];
  }
}

/** 상속인 아닌 수급권자(사실혼 배우자 등) 선택값. 엔진 입력에서는 `heirName` 을 생략한다. */
export const NON_HEIR_RECIPIENT = "__non-heir__";

/**
 * 상속인이 있는데 유족급여를 총액으로만 넣은 산재 사망 입력인지. 총액에서 먼저 공제하고
 * 상속하는 방식이라 대법원 2008다13104 전원합의체가 배척한 계산이다 (이전 버전 파일 호환용).
 */
export function isLegacySurvivorTotal(state: CompensationDeathFormState): boolean {
  return (
    state.accidentType === "industrial" &&
    state.includeHeirs &&
    state.survivorRecipients.length === 0 &&
    parseWonAmount(state.survivorBenefitWonText, 0) > 0
  );
}

export interface CompensationDeathFormState extends DeductionsFormState, LaborRateTimingFormState {
  accidentType: "auto" | "industrial";
  birthDate: string;
  accidentDate: string;
  sex: "male" | "female";
  retirementAgeText: string;
  occupation: string;
  directWageWonText: string;
  workingDaysPerMonthText: string;
  livingCostDeductionRatioText: string;
  funeralExpenseWonText: string;
  solatiumWonText: string;
  faultRatioText: string;
  /** 보험약관 지급기준: 위자료에도 과실상계 적용. 기본 꺼짐 (판결 실무). */
  applyFaultToSolatium: boolean;
  /** 산재(산×사망) 유족급여 (원). accidentType === "industrial" 일 때만 적용. */
  survivorBenefitWonText: string;
  /**
   * 유족급여 수급권자별 지급액. 있으면 총액(`survivorBenefitWonText`) 대신 이것으로 상속인별
   * 공제한다 (대법원 2009. 5. 21. 선고 2008다13104 전원합의체). 상속인 입력이 필요하다.
   */
  survivorRecipients: SurvivorRecipientInputState[];
  /** 기타손해 (개호비·치료비·보조구). 미입력 시 결과 회귀 0. */
  otherDamages: OtherDamagesFormState;
  includeHeirs: boolean;
  decedent: DecedentInput;
  spouse: SpouseInput;
  linealDescendants: HeirInput[];
  linealAscendants: HeirInput[];
  siblings: HeirInput[];
  collateralFourth: HeirInput[];
}

// 엔진 기본(1/3)과 같은 값. 종전 "0.3333" 은 1/3 과 금액이 달랐다.
const DEFAULT_LIVING_COST_DEDUCTION_RATIO = "1/3";

export function defaultCompensationDeathFormState(): CompensationDeathFormState {
  return {
    accidentType: "auto",
    birthDate: "1996-01-01",
    accidentDate: "2026-01-01",
    sex: "male",
    retirementAgeText: String(DEFAULT_RETIREMENT_AGE),
    occupation: DEFAULT_OCCUPATION,
    directWageWonText: "",
    workingDaysPerMonthText: String(DEFAULT_WORKING_DAYS),
    livingCostDeductionRatioText: DEFAULT_LIVING_COST_DEDUCTION_RATIO,
    funeralExpenseWonText: String(DEFAULT_FUNERAL_EXPENSE),
    solatiumWonText: "",
    faultRatioText: "",
    applyFaultToSolatium: false,
    ...defaultLaborRateTiming(),
    ...defaultDeductionsFormState(),
    survivorBenefitWonText: "",
    survivorRecipients: [],
    otherDamages: defaultOtherDamagesFormState(),
    includeHeirs: false,
    decedent: { name: "", deceasedAt: "2026-01-01" },
    spouse: { alive: true, name: "" },
    linealDescendants: [],
    linealAscendants: [],
    siblings: [],
    collateralFourth: [],
  };
}

export function buildCompensationDeathInput(
  state: CompensationDeathFormState,
): CompensationAutoDeathInput {
  const { retirementAge, workingDaysPerMonth } = readRetirementAndWorkingDays(state);

  const occupation = state.occupation.trim();
  const directWageWon = parseWonAmount(state.directWageWonText, 0);
  const lostIncome: CompensationAutoDeathInput["lostIncome"] = {
    discountMethod: "hoffman",
    workingDaysPerMonth,
  };
  if (occupation.length > 0) lostIncome.occupation = occupation;
  if (directWageWon > 0) lostIncome.directWageWon = directWageWon;

  const input: CompensationAutoDeathInput = {
    mode: "death",
    base: {
      birthDate: state.birthDate,
      accidentDate: state.accidentDate,
      sex: state.sex,
      retirementAge,
      ...readLaborRateTiming(state),
    },
    lostIncome,
  };

  const livingCost = readRatio("생계비 공제 비율", state.livingCostDeductionRatioText);
  if (livingCost !== undefined) input.livingCostDeductionRatio = livingCost;
  const funeral = parseWonAmount(state.funeralExpenseWonText, DEFAULT_FUNERAL_EXPENSE);
  input.funeralExpenseWon = funeral;
  const solatium = parseWonAmount(state.solatiumWonText, 0);
  if (solatium > 0) input.solatiumWon = solatium;
  const fault = readRatio("과실비율", state.faultRatioText) ?? 0;
  if (fault > 0) input.faultRatio = fault;
  if (state.applyFaultToSolatium) input.applyFaultToSolatium = true;
  const deductions = buildDeductionsInput(state);
  if (deductions) input.deductions = deductions;
  if (state.accidentType === "industrial") {
    input.accidentType = "industrial";
    const recipients = state.survivorRecipients
      .map((item, i) => {
        const node: { heirName?: string; survivorBenefitWon: number } = {
          survivorBenefitWon: parseWonAmount(item.amountText, 0),
        };
        if (item.heirName.length === 0 && node.survivorBenefitWon > 0) {
          throw new Error(
            `수급권자 ${i + 1}번째: 상속인을 고르세요. 상속인이 아니면 "상속인 아님"을 고릅니다.`,
          );
        }
        if (item.heirName !== NON_HEIR_RECIPIENT) node.heirName = item.heirName;
        return node;
      })
      .filter((item) => item.survivorBenefitWon > 0);
    if (recipients.length > 0) {
      if (!state.includeHeirs) {
        throw new Error("수급권자별 유족급여는 상속인을 입력해야 상속인별로 공제할 수 있습니다.");
      }
      // 목록에 없는 상속인(이름을 고친 뒤 남은 선택)은 계산 전에 막는다. 엔진도 거부한다.
      // 상속인 입력 자체가 잘못돼 이름을 못 구하면 그 오류는 상속 계산이 따로 낸다.
      const names = heirNamesOf(state);
      if (names.length > 0) {
        state.survivorRecipients.forEach((item, i) => {
          const error = recipientHeirError(item.heirName, names);
          if (error) throw new Error(`수급권자 ${i + 1}번째: ${error}`);
        });
      }
      input.industrialInsurance = { recipients };
    } else {
      const survivor = parseWonAmount(state.survivorBenefitWonText, 0);
      if (survivor > 0) input.industrialInsurance = { survivorBenefitWon: survivor };
    }
  }
  const otherDamages = buildOtherDamagesInput(state.otherDamages);
  if (otherDamages) input.otherDamages = otherDamages;
  if (state.includeHeirs) {
    input.heirs = buildInheritanceInput({
      decedent: state.decedent,
      spouse: state.spouse,
      linealDescendants: state.linealDescendants,
      linealAscendants: state.linealAscendants,
      siblings: state.siblings,
      collateralFourth: state.collateralFourth,
    });
  }

  return input;
}

export function applyLoadedCompensationDeathInput(
  input: CompensationAutoDeathInput,
): CompensationDeathFormState {
  const base = defaultCompensationDeathFormState();
  const next: CompensationDeathFormState = {
    ...base,
    accidentType: input.accidentType ?? "auto",
    survivorBenefitWonText:
      input.industrialInsurance?.survivorBenefitWon === undefined
        ? ""
        : String(input.industrialInsurance.survivorBenefitWon),
    survivorRecipients: (input.industrialInsurance?.recipients ?? []).map((item) => ({
      uid: newUid(),
      heirName: item.heirName ?? NON_HEIR_RECIPIENT,
      amountText: String(item.survivorBenefitWon),
    })),
    birthDate: input.base.birthDate,
    accidentDate: input.base.accidentDate,
    sex: input.base.sex,
    retirementAgeText: String(input.base.retirementAge ?? DEFAULT_RETIREMENT_AGE),
    occupation: input.lostIncome.occupation ?? "",
    directWageWonText:
      input.lostIncome.directWageWon === undefined ? "" : String(input.lostIncome.directWageWon),
    workingDaysPerMonthText: String(input.lostIncome.workingDaysPerMonth ?? DEFAULT_WORKING_DAYS),
    livingCostDeductionRatioText:
      input.livingCostDeductionRatio === undefined
        ? DEFAULT_LIVING_COST_DEDUCTION_RATIO
        : formatRatioText(input.livingCostDeductionRatio),
    funeralExpenseWonText: String(input.funeralExpenseWon ?? DEFAULT_FUNERAL_EXPENSE),
    solatiumWonText: input.solatiumWon === undefined ? "" : String(input.solatiumWon),
    faultRatioText: input.faultRatio === undefined ? "" : formatRatioText(input.faultRatio),
    applyFaultToSolatium: input.applyFaultToSolatium === true,
    ...applyLaborRateTiming(input.base),
    ...applyDeductionsInput(input.deductions),
    otherDamages: applyOtherDamagesInput(input.otherDamages),
    includeHeirs: input.heirs !== undefined,
  };
  if (input.heirs !== undefined) {
    const groups = applyInheritanceInput(input.heirs);
    next.decedent = groups.decedent;
    next.spouse = groups.spouse;
    next.linealDescendants = groups.linealDescendants;
    next.linealAscendants = groups.linealAscendants;
    next.siblings = groups.siblings;
    next.collateralFourth = groups.collateralFourth;
  }
  return next;
}

/** 유족급여를 수급권자별로 공제한 결과인지 (상속인별 공제액 열을 낸다). */
function hasSurvivorBenefitColumn(result: CompensationAutoDeathResult): boolean {
  return (result.inheritanceShares ?? []).some(
    (share) => share.survivorBenefitDeductedWon !== undefined,
  );
}

export function formatCompensationDeathForClipboard(
  result: CompensationAutoDeathResult,
  timing?: LaborRateTiming,
): string {
  const segmentRows = result.segments
    .map(
      (segment, i) =>
        `${i + 1}\t${segmentPeriodText(segment)}\t${formatWon(segment.dailyWageWon)}/일\t호프만 ${segment.appliedHoffman.toFixed(6)}\t${formatWon(segment.amountFloorWon)}`,
    )
    .join("\n");

  const lines = [
    result.accidentType === "industrial"
      ? "LawCalc Korea 산재 사고 사망 손해배상 계산 결과"
      : "LawCalc Korea 자동차 사고 사망 손해배상 계산 결과",
    ...(timing ? [`노임 기준: ${laborRateTimingText(timing)}`] : []),
    `생계비 공제 비율: ${formatRatioPercent(result.livingCostDeductionRatio)}`,
    `일실수입 소계 (생계비 공제 후): ${formatWon(result.lostIncomeSubtotalWon)}`,
  ];
  if (result.industrialBenefit !== undefined) {
    lines.push(...buildIndustrialBenefitLines(result.industrialBenefit, "유족급여"));
  }
  lines.push(
    `위자료: ${formatWon(result.solatiumWon)}`,
    `장례비: ${formatWon(result.funeralExpenseWon)}`,
    `과실상계 대상 소계: ${formatWon(result.pecuniaryDamagesSubtotalWon)}`,
    `과실상계 (${formatRatioPercent(result.faultOffset.ratio)} 후): ${formatWon(result.faultOffset.afterWon)}`,
    ...deductionRows(result).map(([label, value]) => `${label}: ${value}`),
  );
  if (result.deductions.industrialBenefitWon !== undefined) {
    // legacy — ≤ v0.9.x 로 저장된 .lcalc 결과(과실상계 후 총액 공제)를 그대로 표시.
    lines.push(
      `산재보험급여 공제 (유족급여): ${formatWon(result.deductions.industrialBenefitWon)}`,
    );
  }
  for (const [label, value] of solatiumSettlementRows(result)) lines.push(`${label}: ${value}`);
  if (result.otherDamages !== undefined) {
    lines.push(
      `개호비: ${formatWon(result.otherDamages.attendantCareWon)}`,
      `치료비: ${formatWon(result.otherDamages.treatmentWon)}`,
      `보조구: ${formatWon(result.otherDamages.applianceWon)}`,
      `기타손해 소계: ${formatWon(result.otherDamages.subtotalWon)}`,
    );
  }
  lines.push(
    `최종 합계: ${formatWon(result.finalWon)}`,
    `데이터 버전: laborRates=${result.dataVersions.laborRates} / lifeExpectancy=${result.dataVersions.lifeExpectancy} / hoffman=${result.dataVersions.hoffman} / leibniz=${result.dataVersions.leibniz}`,
    `계산 시각: ${result.computedAt}`,
    "",
    "구간\t기간\t단가\t호프만(적용)\t금액 (생계비 공제 후)",
    segmentRows,
  );

  if (result.inheritanceShares !== undefined && result.inheritanceShares.length > 0) {
    const survivor = hasSurvivorBenefitColumn(result);
    lines.push("", `상속인\t지분(약분)${survivor ? "\t유족급여 공제" : ""}\t배정 금액`);
    lines.push(
      result.inheritanceShares
        .map(
          (share) =>
            `${share.name}\t${share.numerator}/${share.denominator}${
              survivor ? `\t${formatWon(share.survivorBenefitDeductedWon ?? 0)}` : ""
            }\t${formatWon(share.amountWon)}`,
        )
        .join("\n"),
    );
  }

  lines.push(...clipboardWarningLines(result));
  lines.push("", STANDARD_DISCLAIMER);
  return lines.join("\n");
}

export function buildCompensationDeathLcalcFile(
  input: CompensationAutoDeathInput,
  result: CompensationAutoDeathResult,
  note: string,
): LcalcFile {
  const payload: LcalcCompensationPayload = {
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    input,
    result: { ...result, disclaimer: STANDARD_DISCLAIMER },
    disclaimer: STANDARD_DISCLAIMER,
  };
  if (note.trim()) payload.note = note.trim();
  return {
    schemaVersion: CURRENT_LCALC_SCHEMA_VERSION,
    kind: "compensation",
    // 부상과 같다: 새 저장은 늘 @5.
    envelopeFeatures: ["compensation@5"],
    dataVersions: {
      laborRates: result.dataVersions.laborRates,
      lifeExpectancy: result.dataVersions.lifeExpectancy,
      hoffman: result.dataVersions.hoffman,
      leibniz: result.dataVersions.leibniz,
    },
    payload,
  };
}

function deathStateForDirtySnapshot(state: CompensationDeathFormState) {
  return {
    accidentType: state.accidentType,
    survivorBenefitWonText: state.survivorBenefitWonText,
    survivorRecipients: state.survivorRecipients.map((item) => ({
      heirName: item.heirName,
      amountText: item.amountText,
    })),
    birthDate: state.birthDate,
    accidentDate: state.accidentDate,
    sex: state.sex,
    retirementAgeText: state.retirementAgeText,
    occupation: state.occupation,
    directWageWonText: state.directWageWonText,
    workingDaysPerMonthText: state.workingDaysPerMonthText,
    livingCostDeductionRatioText: state.livingCostDeductionRatioText,
    funeralExpenseWonText: state.funeralExpenseWonText,
    solatiumWonText: state.solatiumWonText,
    faultRatioText: state.faultRatioText,
    applyFaultToSolatium: state.applyFaultToSolatium,
    calculationDate: state.calculationDate,
    laborRateEffectiveRule: state.laborRateEffectiveRule,
    ...deductionsForDirtySnapshot(state),
    otherDamages: otherDamagesForDirtySnapshot(state.otherDamages),
    includeHeirs: state.includeHeirs,
    decedent: state.decedent,
    spouse: state.spouse,
    linealDescendants: heirsForDirtySnapshot(state.linealDescendants),
    linealAscendants: heirsForDirtySnapshot(state.linealAscendants),
    siblings: heirsForDirtySnapshot(state.siblings),
    collateralFourth: heirsForDirtySnapshot(state.collateralFourth),
  };
}

function buildCompensationDeathDirtySnapshot(state: CompensationDeathFormState, note: string) {
  return createLcalcDirtySnapshot({ state: deathStateForDirtySnapshot(state), note });
}

type CompensationMode = "injury" | "death";

/**
 * 손해배상 탭. 자×부상(`compensation@1`) / 자×사망(`compensation@2`) 하위 탭으로 분기한다.
 * 전체 5탭 구조는 유지하며, 6번째 탭을 만들지 않는다 (plan 4절 결정 3).
 */
/** 사건 파일에서 꺼낸 compensation envelope 가 사망 모드인지 판별한다. */
/**
 * `.lcalc` 열기 비교용 세부 키. 최종액이 같아도 소계·과실상계 후 값이 바뀌면(예: 과실 0% 에
 * 위자료가 있는 구 파일은 위자료가 소계에서 빠져도 최종액이 같다) 세부 구성 안내를 낸다.
 */
function compensationResultDetailKey(result: CompensationResult | CompensationAutoDeathResult) {
  return `${result.pecuniaryDamagesSubtotalWon}/${result.faultOffset.afterWon}`;
}

function isDeathCompensationLcalcFile(file: LcalcFile): boolean {
  if (file.kind !== "compensation") {
    return false;
  }
  const input: unknown = file.payload.input;
  return (
    typeof input === "object" && input !== null && (input as { mode?: unknown }).mode === "death"
  );
}

/**
 * 부상/사망 inner view 공용 props. 두 view 는 늘 마운트해 두고 고르지 않은 쪽은 숨긴다.
 * 모드를 오가도 입력이 남고, 미저장 추적도 view 별 키로 따로 유지된다. 사건 파일 슬롯은
 * wrapper 가 하나만 등록하고 `caseSlotRef` 로 각 view 의 최신 슬롯에 위임한다.
 */
interface CompensationViewProps {
  active?: boolean;
  caseSlotRef?: React.MutableRefObject<CaseSlot | null>;
}

const COMPENSATION_MODE_LABELS: Record<CompensationMode, string> = {
  injury: "부상",
  death: "사망",
};

export function CompensationCalculator({ active = true }: { active?: boolean }) {
  const [mode, setMode] = useState<CompensationMode>("injury");
  const injurySlotRef = useRef<CaseSlot | null>(null);
  const deathSlotRef = useRef<CaseSlot | null>(null);
  const slotOf = (target: CompensationMode) =>
    (target === "death" ? deathSlotRef : injurySlotRef).current;
  // 마지막 collect 가 실제로 담은 모드. markSaved 는 그 모드만 저장 완료로 둔다.
  const collectedModeRef = useRef<CompensationMode | null>(null);

  useCaseSlot("compensation", {
    // 사건 파일에는 손해배상 계산이 하나만 들어간다. 지금 모드에 내용이 있으면 그것을,
    // 없으면 다른 모드를 담는다. 둘 다 있으면 지금 모드를 담고 빠진 쪽을 알린다.
    collect: () => {
      const other: CompensationMode = mode === "death" ? "injury" : "death";
      const current = slotOf(mode)?.collect() ?? { status: "pristine" };
      const fallback = slotOf(other)?.collect() ?? { status: "pristine" };
      if (current.status === "pristine") {
        collectedModeRef.current = fallback.status === "ok" ? other : null;
        return fallback;
      }
      collectedModeRef.current = current.status === "ok" ? mode : null;
      if (current.status === "ok" && fallback.status !== "pristine") {
        return {
          ...current,
          notice: `손해배상 ${COMPENSATION_MODE_LABELS[other]} 입력은 이 사건 파일에 들어가지 않습니다.`,
        };
      }
      return current;
    },
    apply: (file) => {
      const target = isDeathCompensationLcalcFile(file) ? "death" : "injury";
      // 대상 모드에 먼저 적용한다. 파일이 깨져 실패하면 여기서 throw 되어 다른 모드 입력은
      // 그대로 남는다. 성공한 뒤에만 다른 모드에 남은 이전 사건 입력을 비워, 다음 사건
      // 저장에 섞이지 않게 한다.
      const differs = slotOf(target)?.apply(file);
      slotOf(target === "death" ? "injury" : "death")?.reset();
      setMode(target);
      return differs;
    },
    markSaved: () => {
      if (collectedModeRef.current) slotOf(collectedModeRef.current)?.markSaved();
    },
    reset: () => {
      injurySlotRef.current?.reset();
      deathSlotRef.current?.reset();
    },
  });

  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 pt-4 sm:px-6">
        <Button
          variant={mode === "injury" ? "default" : "ghost"}
          size="sm"
          type="button"
          onClick={() => setMode("injury")}
          aria-pressed={mode === "injury"}
        >
          자동차 사고 · 부상
        </Button>
        <Button
          variant={mode === "death" ? "default" : "ghost"}
          size="sm"
          type="button"
          onClick={() => setMode("death")}
          aria-pressed={mode === "death"}
        >
          자동차 사고 · 사망
        </Button>
      </div>
      <div
        className={mode === "injury" ? "contents" : "hidden"}
        data-testid="compensation-injury-panel"
      >
        <InjuryCompensationView active={active && mode === "injury"} caseSlotRef={injurySlotRef} />
      </div>
      <div
        className={mode === "death" ? "contents" : "hidden"}
        data-testid="compensation-death-panel"
      >
        <DeathCompensationView active={active && mode === "death"} caseSlotRef={deathSlotRef} />
      </div>
    </div>
  );
}

function InjuryCompensationView({ active = true, caseSlotRef }: CompensationViewProps) {
  const [state, setState] = useState<CompensationFormState>(defaultCompensationFormState);
  // 입원기간 100% 토글이 없던 이전 버전 파일을 열었는지. 끈 상태로 연 이유를 알린다.
  const [legacyHospitalNotice, setLegacyHospitalNotice] = useState(false);
  // 기준일 없는 파일·구 비율공제를 연 경우의 안내 (`legacyCompensationNotice`).
  const [legacyNotice, setLegacyNotice] = useState<string | null>(null);
  // 결과를 낸 입력의 절사 여부. 결과에는 없고, 체크박스를 바꿔도 다시 계산 전까지 결과 카드는 그대로다.
  const [resultCourtTruncation, setResultCourtTruncation] = useState(false);
  const [note, setNote] = useState("");
  const [loadingAction, setLoadingAction] = useState<ActionName | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const stale = useMemo<StaleBadgeResult>(
    () => computeStaleBadge(LABOR_RATES_SNAPSHOT_DATE, todayIso()),
    [],
  );

  const dirtySnapshot = useMemo(() => buildCompensationDirtySnapshot(state, note), [state, note]);
  const markCompensationClean = useLcalcDirtyTracker("compensation", dirtySnapshot);
  const pristineSnapshotRef = useRef(dirtySnapshot);
  const resultFingerprint = buildCompensationDirtySnapshot(state, "");
  const {
    value: result,
    setValue: setResult,
    setLoaded: setLoadedResult,
    stale: resultStale,
    notice: resultNotice,
  } = useResultFingerprint<CompensationResult>(resultFingerprint);
  const {
    value: error,
    setValue: setError,
    stale: errorStale,
  } = useResultFingerprint<string>(resultFingerprint);
  const resultReady = result !== null && !resultStale;

  const update = (patch: Partial<CompensationFormState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  const handleCalculate = () => {
    try {
      const input = buildCompensationInput(state);
      const calculated = computeCompensation(input);
      setResult(calculated);
      setResultCourtTruncation(input.base.courtTruncation === true);
      setError(null);
      setToast(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReset = () => {
    setState(defaultCompensationFormState());
    setLegacyHospitalNotice(false);
    setLegacyNotice(null);
    setNote("");
    setResult(null);
    setError(null);
    setToast(null);
  };

  const runAction = async (action: ActionName, task: () => Promise<string | null | void>) => {
    if (loadingAction !== null) return;
    setLoadingAction(action);
    setToast(null);
    try {
      const message = await task();
      if (message) setToast({ type: "success", message });
    } catch (e) {
      setToast({
        type: "error",
        message: e instanceof Error ? e.message : "작업 중 알 수 없는 오류가 발생했습니다.",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCopy = () =>
    runAction("copy", async () => {
      if (!result || resultStale) throw new Error("계산 후 복사해 주세요.");
      await ipc.copyToClipboard(
        formatCompensationForClipboard(result, hospitalizationMonthsOf(result), timingOf(state)),
      );
      return "손해배상 계산 결과를 클립보드에 복사했습니다.";
    });

  const handleExportPdf = () =>
    runAction("pdf", async () => {
      if (!result || resultStale) throw new Error("계산 후 PDF를 저장해 주세요.");
      const path = await ipc.exportCompensationPdf(
        withCompensationExportWarnings(result, timingOf(state)),
      );
      return path ? `PDF 파일을 저장했습니다: ${path}` : null;
    });

  const handleExportCsv = () =>
    runAction("csv", async () => {
      if (!result || resultStale) throw new Error("계산 후 CSV를 저장해 주세요.");
      const path = await ipc.exportCompensationCsv(
        withCompensationExportWarnings(result, timingOf(state)),
      );
      return path ? `CSV 파일을 저장했습니다: ${path}` : null;
    });

  const handleSaveLcalc = () =>
    runAction("save", async () => {
      if (!result || resultStale) throw new Error("계산 후 .lcalc 파일을 저장해 주세요.");
      const input = buildCompensationInput(state);
      const path = await ipc.saveLcalc(buildCompensationLcalcFile(input, result, note));
      if (path) {
        markCompensationClean();
      }
      return path ? `.lcalc 파일을 저장했습니다: ${path}` : "저장을 취소했습니다.";
    });

  const applyLoadedFile = (file: unknown) => {
    const migratedFile = migrateLcalcFile(file);
    validateLcalcEnvelope(migratedFile);
    const loaded = parseLoadedCompensationLcalcInput(migratedFile);
    if (loaded.input.mode === "death") {
      throw new Error('자동차 사고 사망 .lcalc 파일은 "자동차 사고 · 사망" 탭에서 열어 주세요.');
    }
    const injuryInput = loaded.input;
    const appliedState = applyLoadedCompensationInput(injuryInput);
    setLegacyHospitalNotice(injuryInput.lossRate.hospitalizationFullLoss === undefined);
    setLegacyNotice(legacyCompensationNotice(injuryInput));
    const loadedNote = loaded.note ?? "";
    setState(appliedState);
    setResultCourtTruncation(appliedState.courtTruncation);
    setNote(loadedNote);
    const differs = setLoadedResult(
      loaded.result !== undefined && loaded.result.mode !== "death" ? loaded.result : undefined,
      // 화면에 연 상태 그대로 다시 계산한다. 키가 없는 구 파일은 엔진 기본(적용)이 아니라
      // 화면 기본(끔)으로 연다.
      () =>
        computeCompensation({
          ...injuryInput,
          base: {
            ...injuryInput.base,
            calculationDate: appliedState.calculationDate,
            laborRateEffectiveRule: appliedState.laborRateEffectiveRule,
          },
          lossRate: {
            ...injuryInput.lossRate,
            hospitalizationFullLoss: appliedState.hospitalizationFullLoss,
          },
        }),
      (r) => formatWon(r.finalWon),
      compensationResultDetailKey,
    );
    setError(null);
    markCompensationClean(buildCompensationDirtySnapshot(appliedState, loadedNote));
    return differs;
  };

  const caseSlot: CaseSlot = {
    collect: () => {
      if (dirtySnapshot === pristineSnapshotRef.current) {
        return { status: "pristine" };
      }
      try {
        const input = buildCompensationInput(state);
        return {
          status: "ok",
          file: buildCompensationLcalcFile(input, computeCompensation(input), note),
        };
      } catch {
        return { status: "invalid" };
      }
    },
    apply: applyLoadedFile,
    markSaved: () => markCompensationClean(),
    reset: handleReset,
  };
  useEffect(() => {
    if (caseSlotRef) caseSlotRef.current = caseSlot;
  });

  const handleLoadLcalc = () =>
    runAction("load", async () => {
      const file = await ipc.loadLcalc();
      if (!file) return "불러오기를 취소했습니다.";
      applyLoadedFile(file);
      return ".lcalc 파일을 불러왔습니다.";
    });

  useFormShortcuts({
    onSave: () => {
      void handleSaveLcalc();
    },
    onCalculate: handleCalculate,
    onReset: handleReset,
    enabled: active,
  });

  const addPermanent = () => update({ permanent: [...state.permanent, emptyPermanent()] });
  const removePermanent = (uid: string) =>
    update({ permanent: state.permanent.filter((item) => item.uid !== uid) });
  const updatePermanent = (uid: string, patch: Partial<PermanentInputState>) =>
    update({
      permanent: state.permanent.map((item) => (item.uid === uid ? { ...item, ...patch } : item)),
    });

  const addTemporary = () => update({ temporary: [...state.temporary, emptyTemporary()] });
  const removeTemporary = (uid: string) =>
    update({ temporary: state.temporary.filter((item) => item.uid !== uid) });
  const updateTemporary = (uid: string, patch: Partial<TemporaryInputState>) =>
    update({
      temporary: state.temporary.map((item) => (item.uid === uid ? { ...item, ...patch } : item)),
    });

  const overrideEmphasis = stale.overrideStrongly
    ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
    : "";

  // 직종 선택지는 사고일이 속한 노임단가 회차에서 나온다. 회차마다 조사 직종이 다르다.
  const occupationOptions = useMemo(
    () => occupationOptionsAt(state.accidentDate, state.occupation),
    [state.accidentDate, state.occupation],
  );
  const occupationHint = useMemo(
    () => occupationHintAt(state.occupation, state.accidentDate),
    [state.occupation, state.accidentDate],
  );

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[580px_minmax(0,1fr)]">
      <div className="grid gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Scale className="h-4 w-4" aria-hidden="true" />
              기초사항
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              민법 제393조·제396조·제763조 / 대법원 2018다248909 (가동연한 65세).
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                생년월일
                <Input
                  type="date"
                  value={state.birthDate}
                  onChange={(e) => update({ birthDate: e.target.value })}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                성별
                <Select
                  value={state.sex}
                  onChange={(e) => update({ sex: e.target.value as "male" | "female" })}
                >
                  <option value="male">남</option>
                  <option value="female">여</option>
                </Select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                사고일자
                <Input
                  type="date"
                  value={state.accidentDate}
                  onChange={(e) => setState((prev) => withAccidentDate(prev, e.target.value))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                입원치료 종료일
                <Input
                  type="date"
                  value={state.treatmentEndDate}
                  onChange={(e) => update({ treatmentEndDate: e.target.value })}
                />
                <span className="text-xs font-normal text-muted-foreground">
                  따로 고치기 전에는 사고일을 따라갑니다. 월 단위로 내림하여 1개월 미만은 반영되지
                  않습니다.
                </span>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                가동연한 (만 나이)
                <Input
                  inputMode="numeric"
                  value={state.retirementAgeText}
                  onChange={(e) => update({ retirementAgeText: e.target.value })}
                />
                <FieldError
                  message={parseNumberText(state.retirementAgeText, RETIREMENT_AGE_FORMAT).error}
                />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">노동능력상실률</CardTitle>
            <p className="text-xs text-muted-foreground">
              영구장해 중복은 자동 합산 (1 − Π(1 − rᵢ)), 한시장해는 입력한 기간 동안만 상실률 적용.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">영구장해</span>
                <Button variant="outline" size="sm" type="button" onClick={addPermanent}>
                  <Plus className="mr-1 h-3 w-3" />
                  추가
                </Button>
              </div>
              {state.permanent.map((item) => (
                <div key={item.uid} className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
                  <Input
                    placeholder="진료과 (예: 정형외과)"
                    value={item.department}
                    onChange={(e) => updatePermanent(item.uid, { department: e.target.value })}
                  />
                  <Input
                    inputMode="decimal"
                    placeholder="비율 (0~1, 예: 0.30)"
                    value={item.ratioText}
                    onChange={(e) => updatePermanent(item.uid, { ratioText: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="영구장해 삭제"
                    onClick={() => removePermanent(item.uid)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <div className="col-span-3 empty:hidden">
                    <FieldError message={parseRatioText(item.ratioText).error} />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">한시장해</span>
                <Button variant="outline" size="sm" type="button" onClick={addTemporary}>
                  <Plus className="mr-1 h-3 w-3" />
                  추가
                </Button>
              </div>
              {state.temporary.map((item) => (
                <div
                  key={item.uid}
                  className="grid grid-cols-[1fr_100px_80px_auto] items-center gap-2"
                >
                  <Input
                    placeholder="진료과"
                    value={item.department}
                    onChange={(e) => updateTemporary(item.uid, { department: e.target.value })}
                  />
                  <Input
                    inputMode="decimal"
                    placeholder="비율"
                    value={item.ratioText}
                    onChange={(e) => updateTemporary(item.uid, { ratioText: e.target.value })}
                  />
                  <Input
                    inputMode="decimal"
                    placeholder="년수"
                    value={item.yearsText}
                    onChange={(e) => updateTemporary(item.uid, { yearsText: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="한시장해 삭제"
                    onClick={() => removeTemporary(item.uid)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <div className="col-span-4 grid empty:hidden">
                    <FieldError message={parseRatioText(item.ratioText).error} />
                    <FieldError message={parseNumberText(item.yearsText, YEARS_FORMAT).error} />
                  </div>
                </div>
              ))}
            </div>

            <label className="grid gap-2 border-t border-border pt-3 text-sm font-medium">
              기왕증 기여도 (0~1, 선택)
              <Input
                inputMode="decimal"
                value={state.priorImpairmentRatioText}
                onChange={(e) => update({ priorImpairmentRatioText: e.target.value })}
              />
              <FieldError message={parseRatioText(state.priorImpairmentRatioText).error} />
            </label>

            <label className="flex items-center gap-2 border-t border-border pt-3 text-sm">
              <input
                type="checkbox"
                checked={state.hospitalizationFullLoss}
                onChange={(e) => update({ hospitalizationFullLoss: e.target.checked })}
              />
              입원기간 노동능력상실률 100% 적용
            </label>
            <p className="-mt-2 text-xs text-muted-foreground">
              사고일부터 입원치료 종료일까지는 장해율 대신 100%로 일실수입을 계산합니다.
            </p>
            {legacyHospitalNotice ? (
              <p
                role="status"
                className="-mt-1 text-xs text-amber-700 dark:text-amber-300"
                data-testid="compensation-legacy-hospitalization-notice"
              >
                이전 버전 파일이라 입원기간 100% 적용을 끈 상태로 열었습니다. 켜면 사고일부터
                입원치료 종료일까지 100%로 계산합니다.
              </p>
            ) : null}

            <label className="flex items-center gap-2 border-t border-border pt-3 text-sm">
              <input
                type="checkbox"
                checked={state.courtTruncation}
                onChange={(e) => update({ courtTruncation: e.target.checked })}
              />
              법원 계산 프로그램 방식 절사 (상실률 % 2자리, 호프만 4자리)
            </label>
            <p className="-mt-2 text-xs text-muted-foreground">
              일실수입 구간마다 노동능력상실률을 % 소수 2자리에서, 누적 호프만 계수를 소수 4자리에서
              버린 뒤 계산합니다. 끄면 절사하지 않습니다. 개호비 등 기타손해에는 적용하지 않습니다.
            </p>
          </CardContent>
        </Card>

        <Card className={overrideEmphasis ? `border-2 ${overrideEmphasis}` : ""}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">일실수입</CardTitle>
            <p className="text-xs text-muted-foreground">
              대한건설협회 시중노임 기준 직종 단가를 사용합니다. 일당을 직접 입력하면 직종 단가보다
              우선합니다.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <label className="grid gap-2 text-sm font-medium">
              직종
              <Select
                value={state.occupation}
                onChange={(e) => update({ occupation: e.target.value })}
              >
                {occupationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.available ? option.value : `${option.value} (이 사고일에는 단가 없음)`}
                  </option>
                ))}
              </Select>
              {occupationHint ? (
                <span className="text-xs font-normal text-amber-700 dark:text-amber-300">
                  {occupationHint}
                </span>
              ) : null}
            </label>
            <label className="grid gap-2 text-sm font-medium">
              일당 직접 입력 (원/일, 선택)
              <Input
                inputMode="numeric"
                placeholder="예: 172,068"
                aria-label="일당 직접 입력"
                value={formatWonInput(state.directWageWonText)}
                onChange={(e) => update({ directWageWonText: parseWonText(e.target.value) })}
                className={
                  stale.overrideStrongly ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" : ""
                }
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              월 가동일수
              <Input
                inputMode="numeric"
                value={state.workingDaysPerMonthText}
                onChange={(e) => update({ workingDaysPerMonthText: e.target.value })}
              />
              <FieldError
                message={parseNumberText(state.workingDaysPerMonthText, WORKING_DAYS_FORMAT).error}
              />
              <span className="text-xs font-normal text-muted-foreground">
                대법원 2024. 4. 25. 선고 2020다271650: 2014년 사고 당시 도시 일용근로자는 특별한
                사정이 없는 한 월 20일 초과 인정이 어렵다고 보았습니다. 이 앱은 사고 시기와 무관하게
                20일을 기본값으로 둡니다 (직접 바꿀 수 있습니다).
              </span>
            </label>
            <LaborRateTimingFields value={state} onChange={update} notice={legacyNotice} />
          </CardContent>
        </Card>

        <OtherDamagesFormCard
          value={state.otherDamages}
          onChange={(otherDamages) => update({ otherDamages })}
        />

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">사건종류 · 위자료 · 과실 · 공제</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <div className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">사건종류</span>
              <div className="flex gap-2">
                <Button
                  variant={state.accidentType === "auto" ? "default" : "outline"}
                  size="sm"
                  type="button"
                  onClick={() => update({ accidentType: "auto" })}
                  aria-pressed={state.accidentType === "auto"}
                >
                  자동차
                </Button>
                <Button
                  variant={state.accidentType === "industrial" ? "default" : "outline"}
                  size="sm"
                  type="button"
                  onClick={() => update({ accidentType: "industrial" })}
                  aria-pressed={state.accidentType === "industrial"}
                >
                  산재
                </Button>
              </div>
              {state.accidentType === "industrial" ? (
                <label className="grid gap-2 text-sm font-medium">
                  장해급여 (원, 과실상계 전에 일실수입에서 공제)
                  <Input
                    inputMode="numeric"
                    placeholder="예: 50,000,000"
                    value={formatWonInput(state.disabilityBenefitWonText)}
                    onChange={(e) =>
                      update({ disabilityBenefitWonText: parseWonText(e.target.value) })
                    }
                    data-testid="compensation-disability-benefit-input"
                  />
                  <span className="text-xs font-normal text-muted-foreground">
                    휴업급여를 받았다면 함께 더해 넣으세요. 입원기간 일실수입과 같은 성질의 손해라
                    일실수입 한도에서 먼저 공제한 뒤 과실상계합니다 (대법원 2022. 3. 24. 선고
                    2021다241618 전원합의체).
                  </span>
                </label>
              ) : null}
            </div>

            <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                위자료 (원)
                <Input
                  inputMode="numeric"
                  placeholder="예: 5,000,000"
                  value={formatWonInput(state.solatiumWonText)}
                  onChange={(e) => update({ solatiumWonText: parseWonText(e.target.value) })}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                과실비율 (0~1)
                <Input
                  inputMode="decimal"
                  placeholder="예: 0.30"
                  value={state.faultRatioText}
                  onChange={(e) => update({ faultRatioText: e.target.value })}
                />
                <FieldError message={parseRatioText(state.faultRatioText).error} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.applyFaultToSolatium}
                onChange={(e) => update({ applyFaultToSolatium: e.target.checked })}
              />
              위자료에도 과실상계 적용 (보험약관 기준)
            </label>
            <p className="-mt-2 text-xs text-muted-foreground">
              끄면 판결 실무대로 재산상 손해에만 과실상계·공제를 하고 위자료는 그 뒤에 더합니다.
            </p>

            <DeductionsFields value={state} onChange={update} priorImpairment={true} />

            <label className="grid gap-2 border-t border-border pt-3 text-sm font-medium">
              비고
              <textarea
                aria-label="손해배상 계산 비고"
                className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            <div className="flex gap-2">
              <Button onClick={handleCalculate} type="button">
                계산
              </Button>
              <Button onClick={handleReset} variant="outline" type="button">
                초기화
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        <StaleBadge
          stale={stale}
          effectiveFrom={LATEST_LABOR_RATES_SLICE}
          version={LABOR_RATES_VERSION_TAG}
        />

        {error && !errorStale ? (
          <div
            className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
            role="alert"
          >
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <ResultFreshnessNotice stale={resultStale} notice={resultNotice} />

        {result ? (
          <ResultCards
            result={result}
            hospitalMonths={hospitalizationMonthsOf(result)}
            courtTruncation={resultCourtTruncation}
          />
        ) : null}

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">내보내기</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="flex flex-wrap gap-2">
              <ActionButton
                action="pdf"
                icon={FileDown}
                label="PDF"
                loadingAction={loadingAction}
                requiresResult
                resultReady={resultReady}
                onClick={handleExportPdf}
              />
              <ActionButton
                action="csv"
                icon={FileSpreadsheet}
                label="CSV"
                loadingAction={loadingAction}
                requiresResult
                resultReady={resultReady}
                onClick={handleExportCsv}
              />
              <ActionButton
                action="copy"
                icon={Clipboard}
                label="복사"
                loadingAction={loadingAction}
                requiresResult
                resultReady={resultReady}
                onClick={handleCopy}
              />
              <ActionButton
                action="save"
                icon={FileJson}
                label=".lcalc 저장"
                loadingAction={loadingAction}
                requiresResult
                resultReady={resultReady}
                onClick={handleSaveLcalc}
              />
              <ActionButton
                action="load"
                icon={FileJson}
                label=".lcalc 열기"
                loadingAction={loadingAction}
                requiresResult={false}
                resultReady={resultReady}
                onClick={handleLoadLcalc}
              />
            </div>
            {toast ? <ToastMessage toast={toast} onDismiss={() => setToast(null)} /> : null}
          </CardContent>
        </Card>

        {!result && !error ? (
          <Card>
            <CardContent className="grid gap-2 p-6 text-sm text-muted-foreground">
              <p>
                좌측에서 기초사항, 노동능력상실률, 일실수입을 입력한 후{" "}
                <span className="font-medium text-foreground">계산</span> 버튼을 누르세요.
              </p>
              <p className="text-xs">
                자동차 사고 사망은 상단 "자동차 사고 · 사망" 탭에서 계산합니다. 산재는 사건종류에서
                선택하고, 기타손해(개호비 · 치료비 · 보조구)는 좌측 기타손해 입력에서 함께
                계산합니다.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

function DeathCompensationView({ active = true, caseSlotRef }: CompensationViewProps) {
  const [state, setState] = useState<CompensationDeathFormState>(defaultCompensationDeathFormState);
  const [legacyNotice, setLegacyNotice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [loadingAction, setLoadingAction] = useState<ActionName | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const stale = useMemo<StaleBadgeResult>(
    () => computeStaleBadge(LABOR_RATES_SNAPSHOT_DATE, todayIso()),
    [],
  );

  const dirtySnapshot = useMemo(
    () => buildCompensationDeathDirtySnapshot(state, note),
    [state, note],
  );
  const markCompensationClean = useLcalcDirtyTracker("compensation-death", dirtySnapshot);
  const pristineSnapshotRef = useRef(dirtySnapshot);
  const resultFingerprint = buildCompensationDeathDirtySnapshot(state, "");
  const {
    value: result,
    setValue: setResult,
    setLoaded: setLoadedResult,
    stale: resultStale,
    notice: resultNotice,
  } = useResultFingerprint<CompensationAutoDeathResult>(resultFingerprint);
  const {
    value: error,
    setValue: setError,
    stale: errorStale,
  } = useResultFingerprint<string>(resultFingerprint);
  const resultReady = result !== null && !resultStale;

  const update = (patch: Partial<CompensationDeathFormState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  // 유족급여 수급권자 선택지 = 지금 상속인 입력으로 나오는 상속인 이름 (엔진이 이름으로 맞춘다).
  const heirNames = useMemo(() => heirNamesOf(state), [state]);

  const handleCalculate = () => {
    try {
      const input = buildCompensationDeathInput(state);
      const calculated = computeCompensationDeath(input);
      setResult(calculated);
      setError(null);
      setToast(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReset = () => {
    setState(defaultCompensationDeathFormState());
    setLegacyNotice(null);
    setNote("");
    setResult(null);
    setError(null);
    setToast(null);
  };

  const runAction = async (action: ActionName, task: () => Promise<string | null | void>) => {
    if (loadingAction !== null) return;
    setLoadingAction(action);
    setToast(null);
    try {
      const message = await task();
      if (message) setToast({ type: "success", message });
    } catch (e) {
      setToast({
        type: "error",
        message: e instanceof Error ? e.message : "작업 중 알 수 없는 오류가 발생했습니다.",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCopy = () =>
    runAction("copy", async () => {
      if (!result || resultStale) throw new Error("계산 후 복사해 주세요.");
      await ipc.copyToClipboard(formatCompensationDeathForClipboard(result, timingOf(state)));
      return "사망 손해배상 계산 결과를 클립보드에 복사했습니다.";
    });

  const handleExportPdf = () =>
    runAction("pdf", async () => {
      if (!result || resultStale) throw new Error("계산 후 PDF를 저장해 주세요.");
      const path = await ipc.exportCompensationDeathPdf(
        withCompensationExportWarnings(result, timingOf(state)),
      );
      return path ? `PDF 파일을 저장했습니다: ${path}` : null;
    });

  const handleExportCsv = () =>
    runAction("csv", async () => {
      if (!result || resultStale) throw new Error("계산 후 CSV를 저장해 주세요.");
      const path = await ipc.exportCompensationDeathCsv(
        withCompensationExportWarnings(result, timingOf(state)),
      );
      return path ? `CSV 파일을 저장했습니다: ${path}` : null;
    });

  const handleSaveLcalc = () =>
    runAction("save", async () => {
      if (!result || resultStale) throw new Error("계산 후 .lcalc 파일을 저장해 주세요.");
      const input = buildCompensationDeathInput(state);
      const path = await ipc.saveLcalc(buildCompensationDeathLcalcFile(input, result, note));
      if (path) {
        markCompensationClean();
      }
      return path ? `.lcalc 파일을 저장했습니다: ${path}` : "저장을 취소했습니다.";
    });

  const applyLoadedFile = (file: unknown) => {
    const migratedFile = migrateLcalcFile(file);
    validateLcalcEnvelope(migratedFile);
    const loaded = parseLoadedCompensationLcalcInput(migratedFile);
    if (loaded.input.mode !== "death") {
      throw new Error('자동차 사고 부상 .lcalc 파일은 "자동차 사고 · 부상" 탭에서 열어 주세요.');
    }
    const appliedState = applyLoadedCompensationDeathInput(loaded.input);
    setLegacyNotice(legacyCompensationNotice(loaded.input));
    const loadedNote = loaded.note ?? "";
    setState(appliedState);
    setNote(loadedNote);
    const deathInput = loaded.input;
    const differs = setLoadedResult(
      loaded.result?.mode === "death" ? loaded.result : undefined,
      () =>
        computeCompensationDeath({
          ...deathInput,
          base: {
            ...deathInput.base,
            calculationDate: appliedState.calculationDate,
            laborRateEffectiveRule: appliedState.laborRateEffectiveRule,
          },
        }),
      (r) => formatWon(r.finalWon),
      compensationResultDetailKey,
    );
    setError(null);
    markCompensationClean(buildCompensationDeathDirtySnapshot(appliedState, loadedNote));
    return differs;
  };

  const caseSlot: CaseSlot = {
    collect: () => {
      if (dirtySnapshot === pristineSnapshotRef.current) {
        return { status: "pristine" };
      }
      try {
        const input = buildCompensationDeathInput(state);
        return {
          status: "ok",
          file: buildCompensationDeathLcalcFile(input, computeCompensationDeath(input), note),
        };
      } catch {
        return { status: "invalid" };
      }
    },
    apply: applyLoadedFile,
    markSaved: () => markCompensationClean(),
    reset: handleReset,
  };
  useEffect(() => {
    if (caseSlotRef) caseSlotRef.current = caseSlot;
  });

  const handleLoadLcalc = () =>
    runAction("load", async () => {
      const file = await ipc.loadLcalc();
      if (!file) return "불러오기를 취소했습니다.";
      applyLoadedFile(file);
      return ".lcalc 파일을 불러왔습니다.";
    });

  useFormShortcuts({
    onSave: () => {
      void handleSaveLcalc();
    },
    onCalculate: handleCalculate,
    onReset: handleReset,
    enabled: active,
  });

  const overrideEmphasis = stale.overrideStrongly
    ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
    : "";

  // 직종 선택지는 사고일이 속한 노임단가 회차에서 나온다. 회차마다 조사 직종이 다르다.
  const occupationOptions = useMemo(
    () => occupationOptionsAt(state.accidentDate, state.occupation),
    [state.accidentDate, state.occupation],
  );
  const occupationHint = useMemo(
    () => occupationHintAt(state.occupation, state.accidentDate),
    [state.occupation, state.accidentDate],
  );

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[580px_minmax(0,1fr)]">
      <div className="grid gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Scale className="h-4 w-4" aria-hidden="true" />
              기초사항 (사망)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              민법 제393조·제396조·제763조·제1000조·제1003조·제1009조 / 대법원 2018다248909
              (가동연한 65세). 사망은 노동능력 100% 상실 전제로 일실수입을 산정한 뒤 생계비를
              공제합니다.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                생년월일
                <Input
                  type="date"
                  value={state.birthDate}
                  onChange={(e) => update({ birthDate: e.target.value })}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                성별
                <Select
                  value={state.sex}
                  onChange={(e) => update({ sex: e.target.value as "male" | "female" })}
                >
                  <option value="male">남</option>
                  <option value="female">여</option>
                </Select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                사고(사망)일자
                <Input
                  type="date"
                  value={state.accidentDate}
                  onChange={(e) => setState((prev) => withAccidentDate(prev, e.target.value))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                가동연한 (만 나이)
                <Input
                  inputMode="numeric"
                  value={state.retirementAgeText}
                  onChange={(e) => update({ retirementAgeText: e.target.value })}
                />
                <FieldError
                  message={parseNumberText(state.retirementAgeText, RETIREMENT_AGE_FORMAT).error}
                />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card className={overrideEmphasis ? `border-2 ${overrideEmphasis}` : ""}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">일실수입</CardTitle>
            <p className="text-xs text-muted-foreground">
              대한건설협회 시중노임 기준 직종 단가를 사용합니다. 일당을 직접 입력하면 직종 단가보다
              우선합니다.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <label className="grid gap-2 text-sm font-medium">
              직종
              <Select
                value={state.occupation}
                onChange={(e) => update({ occupation: e.target.value })}
              >
                {occupationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.available ? option.value : `${option.value} (이 사고일에는 단가 없음)`}
                  </option>
                ))}
              </Select>
              {occupationHint ? (
                <span className="text-xs font-normal text-amber-700 dark:text-amber-300">
                  {occupationHint}
                </span>
              ) : null}
            </label>
            <label className="grid gap-2 text-sm font-medium">
              일당 직접 입력 (원/일, 선택)
              <Input
                inputMode="numeric"
                placeholder="예: 172,068"
                aria-label="일당 직접 입력"
                value={formatWonInput(state.directWageWonText)}
                onChange={(e) => update({ directWageWonText: parseWonText(e.target.value) })}
                className={
                  stale.overrideStrongly ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" : ""
                }
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                월 가동일수
                <Input
                  inputMode="numeric"
                  value={state.workingDaysPerMonthText}
                  onChange={(e) => update({ workingDaysPerMonthText: e.target.value })}
                />
                <FieldError
                  message={
                    parseNumberText(state.workingDaysPerMonthText, WORKING_DAYS_FORMAT).error
                  }
                />
                <span className="text-xs font-normal text-muted-foreground">
                  대법원 2024. 4. 25. 선고 2020다271650: 2014년 사고 당시 도시 일용근로자는 특별한
                  사정이 없는 한 월 20일 초과 인정이 어렵다고 보았습니다. 이 앱은 사고 시기와
                  무관하게 20일을 기본값으로 둡니다 (직접 바꿀 수 있습니다).
                </span>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                생계비 공제 비율 (0~1)
                <Input
                  inputMode="decimal"
                  placeholder="예: 1/3"
                  value={state.livingCostDeductionRatioText}
                  onChange={(e) => update({ livingCostDeductionRatioText: e.target.value })}
                />
                <FieldError message={parseRatioText(state.livingCostDeductionRatioText).error} />
              </label>
            </div>
            <LaborRateTimingFields value={state} onChange={update} notice={legacyNotice} />
          </CardContent>
        </Card>

        <OtherDamagesFormCard
          value={state.otherDamages}
          onChange={(otherDamages) => update({ otherDamages })}
        />

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">사건종류 · 장례비 · 위자료 · 과실 · 공제</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <div className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">사건종류</span>
              <div className="flex gap-2">
                <Button
                  variant={state.accidentType === "auto" ? "default" : "outline"}
                  size="sm"
                  type="button"
                  onClick={() => update({ accidentType: "auto" })}
                  aria-pressed={state.accidentType === "auto"}
                >
                  자동차
                </Button>
                <Button
                  variant={state.accidentType === "industrial" ? "default" : "outline"}
                  size="sm"
                  type="button"
                  onClick={() => update({ accidentType: "industrial" })}
                  aria-pressed={state.accidentType === "industrial"}
                >
                  산재
                </Button>
              </div>
              {/* 상속인이 있으면 새 입력은 수급권자별로만 받는다 (2008다13104). 총액 칸은 상속인이
                  없거나 이전 버전 파일처럼 총액이 이미 들어 있을 때만 보인다. */}
              {state.accidentType === "industrial" &&
              state.survivorRecipients.length === 0 &&
              (!state.includeHeirs || state.survivorBenefitWonText !== "") ? (
                <label className="grid gap-2 text-sm font-medium">
                  유족급여 (원, 과실상계 전에 일실수입에서 공제)
                  <Input
                    inputMode="numeric"
                    placeholder="예: 100,000,000"
                    value={formatWonInput(state.survivorBenefitWonText)}
                    onChange={(e) =>
                      update({ survivorBenefitWonText: parseWonText(e.target.value) })
                    }
                    data-testid="compensation-survivor-benefit-input"
                  />
                </label>
              ) : null}
              {isLegacySurvivorTotal(state) ? (
                <p
                  role="status"
                  className="text-xs text-amber-700 dark:text-amber-300"
                  data-testid="compensation-survivor-total-legacy-notice"
                >
                  이전 방식(유족급여 총액을 먼저 공제한 뒤 상속)으로 계산됩니다. 아래에서
                  수급권자별로 나눠 넣으면 수급권자가 상속한 몫에서만 공제하는 판례 방식(대법원
                  2009. 5. 21. 선고 2008다13104 전원합의체)으로 계산합니다.
                </p>
              ) : null}
              {state.accidentType === "industrial" &&
              (state.includeHeirs || state.survivorRecipients.length > 0) ? (
                <SurvivorRecipientsFields
                  recipients={state.survivorRecipients}
                  heirNames={[...new Set(heirNames)]}
                  duplicateHeirNames={new Set(heirNames).size !== heirNames.length}
                  onChange={(survivorRecipients) =>
                    update({
                      survivorRecipients,
                      // 첫 수급권자를 넣으면 총액 칸이 사라지므로 그 금액을 첫 줄로 옮긴다.
                      ...(state.survivorRecipients.length === 0
                        ? { survivorBenefitWonText: "" }
                        : {}),
                    })
                  }
                  firstAmountText={state.survivorBenefitWonText}
                />
              ) : null}
            </div>

            <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                장례비 (원)
                <Input
                  inputMode="numeric"
                  placeholder="예: 5,000,000"
                  value={formatWonInput(state.funeralExpenseWonText)}
                  onChange={(e) => update({ funeralExpenseWonText: parseWonText(e.target.value) })}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                위자료 (원)
                <Input
                  inputMode="numeric"
                  placeholder="예: 80,000,000"
                  value={formatWonInput(state.solatiumWonText)}
                  onChange={(e) => update({ solatiumWonText: parseWonText(e.target.value) })}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                과실비율 (0~1)
                <Input
                  inputMode="decimal"
                  placeholder="예: 0.30"
                  value={state.faultRatioText}
                  onChange={(e) => update({ faultRatioText: e.target.value })}
                />
                <FieldError message={parseRatioText(state.faultRatioText).error} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.applyFaultToSolatium}
                onChange={(e) => update({ applyFaultToSolatium: e.target.checked })}
              />
              위자료에도 과실상계 적용 (보험약관 기준)
            </label>
            <p className="-mt-2 text-xs text-muted-foreground">
              끄면 판결 실무대로 재산상 손해에만 과실상계·공제를 하고 위자료는 그 뒤에 더합니다.
            </p>

            <DeductionsFields value={state} onChange={update} priorImpairment={false} />

            <label className="grid gap-2 border-t border-border pt-3 text-sm font-medium">
              비고
              <textarea
                aria-label="사망 손해배상 계산 비고"
                className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">상속인 (선택)</CardTitle>
            <p className="text-xs text-muted-foreground">
              상속인을 입력하면 최종 손해배상액을 상속분(민법 제1000·1003·1009조)으로 분배합니다.
              상속분 계산은 1991-01-01 이후 사망 사건만 지원합니다.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.includeHeirs}
                onChange={(e) => update({ includeHeirs: e.target.checked })}
              />
              상속분 분배 사용
            </label>
            {state.includeHeirs ? (
              <div className="grid gap-2 border-t border-border pt-3">
                <label className="grid gap-2 text-sm font-medium">
                  피상속인 이름 (선택)
                  <Input
                    placeholder="예: 망인"
                    value={state.decedent.name}
                    onChange={(e) =>
                      update({ decedent: { ...state.decedent, name: e.target.value } })
                    }
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={state.spouse.alive}
                    onChange={(e) =>
                      update({ spouse: { ...state.spouse, alive: e.target.checked } })
                    }
                  />
                  배우자 생존
                </label>
                {state.spouse.alive ? (
                  <label className="grid gap-2 text-sm font-medium">
                    배우자 이름 (선택)
                    <Input
                      placeholder="예: 배우자"
                      value={state.spouse.name}
                      onChange={(e) =>
                        update({ spouse: { ...state.spouse, name: e.target.value } })
                      }
                    />
                  </label>
                ) : null}
                <HeirGroupCard
                  title="1순위 직계비속"
                  hint={HEIR_GROUP_HINTS.linealDescendants}
                  heirs={state.linealDescendants}
                  onChange={(heirs) => update({ linealDescendants: heirs })}
                  allowRepresentation={true}
                  defaultLabel="자녀"
                />
                <HeirGroupCard
                  title="2순위 직계존속"
                  hint={HEIR_GROUP_HINTS.linealAscendants}
                  heirs={state.linealAscendants}
                  onChange={(heirs) => update({ linealAscendants: heirs })}
                  allowRepresentation={false}
                  defaultLabel="직계존속"
                  degreeOptions={[
                    { value: 1, label: "부모 (1촌)" },
                    { value: 2, label: "조부모 (2촌)" },
                    { value: 3, label: "증조부모 (3촌)" },
                  ]}
                />
                <HeirGroupCard
                  title="3순위 형제자매"
                  hint={HEIR_GROUP_HINTS.siblings}
                  heirs={state.siblings}
                  onChange={(heirs) => update({ siblings: heirs })}
                  allowRepresentation={true}
                  defaultLabel="형제자매"
                />
                <HeirGroupCard
                  title="4순위 4촌 이내 방계혈족"
                  hint={HEIR_GROUP_HINTS.collaterals}
                  heirs={state.collateralFourth}
                  onChange={(heirs) => update({ collateralFourth: heirs })}
                  allowRepresentation={false}
                  defaultLabel="방계혈족"
                  degreeOptions={[
                    { value: 3, label: "3촌" },
                    { value: 4, label: "4촌" },
                  ]}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button onClick={handleCalculate} type="button">
            계산
          </Button>
          <Button onClick={handleReset} variant="outline" type="button">
            초기화
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        <StaleBadge
          stale={stale}
          effectiveFrom={LATEST_LABOR_RATES_SLICE}
          version={LABOR_RATES_VERSION_TAG}
        />

        {error && !errorStale ? (
          <div
            className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
            role="alert"
          >
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <ResultFreshnessNotice stale={resultStale} notice={resultNotice} />

        {result ? <DeathResultCards result={result} /> : null}

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">내보내기</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="flex flex-wrap gap-2">
              <ActionButton
                action="pdf"
                icon={FileDown}
                label="PDF"
                loadingAction={loadingAction}
                requiresResult
                resultReady={resultReady}
                onClick={handleExportPdf}
              />
              <ActionButton
                action="csv"
                icon={FileSpreadsheet}
                label="CSV"
                loadingAction={loadingAction}
                requiresResult
                resultReady={resultReady}
                onClick={handleExportCsv}
              />
              <ActionButton
                action="copy"
                icon={Clipboard}
                label="복사"
                loadingAction={loadingAction}
                requiresResult
                resultReady={resultReady}
                onClick={handleCopy}
              />
              <ActionButton
                action="save"
                icon={FileJson}
                label=".lcalc 저장"
                loadingAction={loadingAction}
                requiresResult
                resultReady={resultReady}
                onClick={handleSaveLcalc}
              />
              <ActionButton
                action="load"
                icon={FileJson}
                label=".lcalc 열기"
                loadingAction={loadingAction}
                requiresResult={false}
                resultReady={resultReady}
                onClick={handleLoadLcalc}
              />
            </div>
            {toast ? <ToastMessage toast={toast} onDismiss={() => setToast(null)} /> : null}
          </CardContent>
        </Card>

        {!result && !error ? (
          <Card>
            <CardContent className="grid gap-2 p-6 text-sm text-muted-foreground">
              <p>
                좌측에서 기초사항, 일실수입(생계비 공제), 장례비를 입력한 후{" "}
                <span className="font-medium text-foreground">계산</span> 버튼을 누르세요.
              </p>
              <p className="text-xs">
                상속인을 입력하면 최종액을 상속분으로 분배합니다. 상속분 계산은 1991-01-01 이후 사망
                사건만 지원합니다.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

function DeathResultCards({ result }: { result: CompensationAutoDeathResult }) {
  const hasDates = result.segments.some((segment) => segment.startDate !== undefined);
  const survivorColumn = hasSurvivorBenefitColumn(result);
  return (
    <>
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">계산 결과</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">생계비 공제 비율</span>
            <span className="text-right">
              {formatRatioPercent(result.livingCostDeductionRatio)}
            </span>
            <span className="text-muted-foreground">일실수입 소계 (생계비 공제 후)</span>
            <span className="text-right">{formatWon(result.lostIncomeSubtotalWon)}</span>
            {result.industrialBenefit !== undefined ? (
              <IndustrialBenefitResultRows
                industrialBenefit={result.industrialBenefit}
                benefitLabel="유족급여"
              />
            ) : null}
            <span className="text-muted-foreground">위자료</span>
            <span className="text-right">{formatWon(result.solatiumWon)}</span>
            <span className="text-muted-foreground">장례비</span>
            <span className="text-right">{formatWon(result.funeralExpenseWon)}</span>
            <span className="text-muted-foreground">과실상계 대상 소계</span>
            <span className="text-right">{formatWon(result.pecuniaryDamagesSubtotalWon)}</span>
            {result.deductions.roundingWon !== undefined ? (
              <span
                className="col-span-2 text-xs text-muted-foreground"
                data-testid="compensation-heir-subtotal-note"
              >
                상속인별 계산이라 소계·과실상계 후 금액은 상속인별 몫(원 미만 버림)의 합이어서, 공제
                후 일실수입과 장례비를 더한 값과 몇 원 다를 수 있습니다. 상속분 나눗셈과 상속인별
                100원 미만 버림 차이 합은 아래 &quot;상속분 나눗셈·상속인별 100원 미만 버림&quot;
                행에 보입니다.
              </span>
            ) : null}
            <span className="text-muted-foreground">
              과실상계 ({formatRatioPercent(result.faultOffset.ratio)})
            </span>
            <span className="text-right">{formatWon(result.faultOffset.afterWon)}</span>
            <DeductionResultRows result={result} />
            {result.deductions.industrialBenefitWon !== undefined ? (
              // legacy — ≤ v0.9.x 로 저장된 .lcalc 결과(과실상계 후 총액 공제)를 그대로 표시.
              <>
                <span className="text-muted-foreground">산재보험급여 공제 (유족급여)</span>
                <span
                  className="text-right"
                  data-testid="compensation-death-industrial-benefit-legacy"
                >
                  {formatWon(result.deductions.industrialBenefitWon)}
                </span>
              </>
            ) : null}
            <SolatiumAddedRow result={result} />
            <EngineWarningRows result={result} />
            {result.otherDamages !== undefined ? (
              <OtherDamagesResultRows otherDamages={result.otherDamages} />
            ) : null}
            <span className="border-t border-border pt-2 text-base font-semibold">최종 합계</span>
            <span className="border-t border-border pt-2 text-right text-base font-semibold">
              {formatWon(result.finalWon)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">일실수입 구간 (생계비 공제 후)</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">기간 (개월)</th>
                {hasDates ? <SegmentDateHeaders /> : null}
                <th className="py-2 text-right font-medium">단가 (원/일)</th>
                <th className="py-2 text-right font-medium">호프만 (적용)</th>
                <th className="py-2 text-right font-medium">금액</th>
              </tr>
            </thead>
            <tbody>
              {result.segments.map((segment: CompensationSegment, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td className="py-2">
                    {segment.startMonth} ~ {segment.endMonth}
                  </td>
                  {hasDates ? <SegmentDateCells segment={segment} /> : null}
                  <td className="py-2 text-right">{formatWon(segment.dailyWageWon)}</td>
                  <td className="py-2 text-right">
                    {segment.appliedHoffman.toFixed(6)}
                    {result.hoffman240Cap.cappedAtIndex === i ? (
                      <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">
                        (한도)
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-right">{formatWon(segment.amountFloorWon)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.hoffman240Cap.cappedAtIndex !== null ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              호프만 240 한도 적용. {result.hoffman240Cap.cappedAtIndex + 1}번째 구간부터 누적치가
              240을 초과해 한도를 적용했습니다.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {result.inheritanceShares !== undefined && result.inheritanceShares.length > 0 ? (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">상속인별 분배</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">상속인</th>
                  <th className="py-2 font-medium">지분 (약분)</th>
                  {survivorColumn ? (
                    <th className="py-2 text-right font-medium">유족급여 공제</th>
                  ) : null}
                  <th className="py-2 text-right font-medium">배정 금액</th>
                </tr>
              </thead>
              <tbody>
                {result.inheritanceShares.map((share, i) => (
                  <tr key={`${share.name}-${i}`} className="border-b border-border last:border-b-0">
                    <td className="py-2">{share.name}</td>
                    <td className="py-2 font-mono">
                      {share.numerator}/{share.denominator}
                    </td>
                    {survivorColumn ? (
                      <td className="py-2 text-right" data-testid="compensation-survivor-deducted">
                        {formatWon(share.survivorBenefitDeductedWon ?? 0)}
                      </td>
                    ) : null}
                    <td className="py-2 text-right">{formatWon(share.amountWon)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {survivorColumn ? (
              <p className="mt-2 text-xs text-muted-foreground">
                유족급여는 수급권자가 상속한 일실수입 몫을 한도로 그 몫에서만 공제했습니다 (대법원
                2009. 5. 21. 선고 2008다13104 전원합의체). 배정 금액은 상속인별로
                과실상계·공제·100원 미만 버림을 한 값이고, 그 버림 차이는 위 계산 결과에 따로 행으로
                보입니다.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="grid gap-2 p-4 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="font-medium text-foreground">데이터 버전</dt>
            <dd>
              {result.dataVersions.laborRates} · {result.dataVersions.lifeExpectancy} ·{" "}
              {result.dataVersions.hoffman} · {result.dataVersions.leibniz}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">계산 시각</dt>
            <dd>{formatComputedAt(result.computedAt)}</dd>
          </div>
        </CardContent>
      </Card>

      <div
        className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
        data-testid="compensation-death-disclaimer"
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{result.disclaimer || STANDARD_DISCLAIMER}</span>
      </div>
    </>
  );
}

/** 구간표 초일·말일 열 (계산 기준일을 넣은 결과에만). 판결 계산표 형식과 맞춘다. */
function SegmentDateHeaders() {
  return (
    <>
      <th className="py-2 font-medium">초일</th>
      <th className="py-2 font-medium">말일</th>
    </>
  );
}

function SegmentDateCells({ segment }: { segment: CompensationSegment }) {
  return (
    <>
      <td className="py-2 whitespace-nowrap">{segment.startDate ?? ""}</td>
      <td className="py-2 whitespace-nowrap">{segment.endDate ?? ""}</td>
    </>
  );
}

/** 공제 입력 줄 목록 (비고 + 금액 또는 비율 + 삭제). */
function DeductionRowsInput<T extends { uid: string; label: string }>({
  items,
  onChange,
  name,
  field,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  name: string;
  field: { key: "amountText" | "ratioText"; placeholder: string };
}) {
  const patch = (uid: string, next: Partial<T>) =>
    onChange(items.map((item) => (item.uid === uid ? { ...item, ...next } : item)));
  return (
    <>
      {items.map((item) => {
        const text = (item as unknown as Record<string, string>)[field.key] ?? "";
        const isAmount = field.key === "amountText";
        return (
          <div key={item.uid} className="grid grid-cols-[1fr_140px_auto] items-center gap-2">
            <Input
              placeholder="비고"
              value={item.label}
              onChange={(e) => patch(item.uid, { label: e.target.value } as Partial<T>)}
            />
            <Input
              inputMode={isAmount ? "numeric" : "decimal"}
              placeholder={field.placeholder}
              aria-label={`${name} ${field.placeholder}`}
              value={isAmount ? formatWonInput(text) : text}
              onChange={(e) =>
                patch(item.uid, {
                  [field.key]: isAmount ? parseWonText(e.target.value) : e.target.value,
                } as Partial<T>)
              }
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${name} 삭제`}
              onClick={() => onChange(items.filter((other) => other.uid !== item.uid))}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            {isAmount ? null : (
              <div className="col-span-3 empty:hidden">
                <FieldError message={parseRatioText(text).error} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function DeductionSectionHeader({ title, onAdd }: { title: string; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      {onAdd ? (
        <Button variant="outline" size="sm" type="button" onClick={onAdd}>
          <Plus className="mr-1 h-3 w-3" />
          추가
        </Button>
      ) : null}
    </div>
  );
}

/**
 * 공제 입력 (비율공제·지급치료비·전액공제, 이전 방식 비율공제). 부상·사망 공용.
 * 사망은 기왕증이 없어 공제 계수가 과실비율과 같다 (`priorImpairment` false).
 */
function DeductionsFields({
  value,
  onChange,
  priorImpairment,
}: {
  value: DeductionsFormState;
  onChange: (patch: Partial<DeductionsFormState>) => void;
  priorImpairment: boolean;
}) {
  const factor = priorImpairment ? "[1 − (1 − 기왕증)(1 − 과실)]" : "과실비율";
  const amountField = { key: "amountText", placeholder: "금액 (원)" } as const;
  return (
    <>
      <div className="grid gap-2 border-t border-border pt-3">
        <DeductionSectionHeader
          title="비율공제 (항목 금액)"
          onAdd={() =>
            onChange({ ratioDeductions: [...value.ratioDeductions, emptyRatioDeduction()] })
          }
        />
        <p className="text-xs text-muted-foreground">
          항목 금액 × {factor}을 재산상 손해에서 뺍니다 (법원 손해배상 계산 프로그램의 비율공제
          방식). 재산상 손해를 넘는 부분은 빼지 않고 위자료도 줄이지 않습니다.
        </p>
        <DeductionRowsInput
          items={value.ratioDeductions}
          onChange={(ratioDeductions) => onChange({ ratioDeductions })}
          name="비율공제"
          field={amountField}
        />
      </div>

      <div className="grid gap-2 border-t border-border pt-3">
        <DeductionSectionHeader
          title="지급치료비 (보험사가 직접 낸 치료비)"
          onAdd={() =>
            onChange({
              paidTreatmentDeductions: [...value.paidTreatmentDeductions, emptyAbsoluteDeduction()],
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          보험사 등이 이미 지급한 치료비는 기타손해의 기왕치료비에 넣지 말고 여기 넣으세요.
          지급치료비 × {factor}만큼 공제되어, 이미 받은 치료비 중 본인이 부담할 몫이 빠집니다.
          기왕치료비에 이미 넣었다면 지급치료비 대신 전액공제에 넣으세요. 재산상 손해를 넘는 부분은
          빼지 않고 위자료도 줄이지 않습니다.
        </p>
        <DeductionRowsInput
          items={value.paidTreatmentDeductions}
          onChange={(paidTreatmentDeductions) => onChange({ paidTreatmentDeductions })}
          name="지급치료비"
          field={amountField}
        />
      </div>

      <div className="grid gap-2 border-t border-border pt-3">
        <DeductionSectionHeader
          title="전액공제 (선급금 등)"
          onAdd={() =>
            onChange({
              absoluteDeductions: [...value.absoluteDeductions, emptyAbsoluteDeduction()],
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          손해 전체에 대한 변제(선급금 등)는 금액 그대로 뺍니다. 재산상 손해를 넘으면 그 초과분은
          위자료에서 뺍니다. 기왕치료비에 넣은 치료비를 보험사가 이미 냈다면 그 금액도 여기
          넣습니다.
        </p>
        <DeductionRowsInput
          items={value.absoluteDeductions}
          onChange={(absoluteDeductions) => onChange({ absoluteDeductions })}
          name="전액공제"
          field={amountField}
        />
      </div>

      {value.legacyRatioDeductions.length > 0 ? (
        <div
          className="grid gap-2 border-t border-border pt-3"
          data-testid="compensation-legacy-ratio-deductions"
        >
          <DeductionSectionHeader title="이전 방식 비율공제 (과실상계 후 금액 × 비율)" />
          <p className="text-xs text-muted-foreground">
            이전 버전 파일의 비율공제를 저장 당시 방식(과실상계 후 금액 × 비율)대로 보존한 것입니다.
            새로 추가할 수 없습니다. 법원 방식으로 바꾸려면 이 줄을 지우고 공제할 항목 금액을
            비율공제 칸에 넣으세요.
          </p>
          <DeductionRowsInput
            items={value.legacyRatioDeductions}
            onChange={(legacyRatioDeductions) => onChange({ legacyRatioDeductions })}
            name="이전 방식 비율공제"
            field={{ key: "ratioText", placeholder: "비율 (0~1)" }}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * 유족급여 수급권자별 입력. 상속인 이름을 고르면 그 상속인 몫에서만 공제한다
 * (대법원 2009. 5. 21. 선고 2008다13104 전원합의체).
 */
function SurvivorRecipientsFields({
  recipients,
  heirNames,
  onChange,
  firstAmountText,
  duplicateHeirNames,
}: {
  recipients: SurvivorRecipientInputState[];
  heirNames: string[];
  /** 상속인 이름이 겹치면 엔진이 이름으로 몫을 고를 수 없어 거부한다. 미리 알린다. */
  duplicateHeirNames: boolean;
  onChange: (recipients: SurvivorRecipientInputState[]) => void;
  firstAmountText: string;
}) {
  const patch = (uid: string, next: Partial<SurvivorRecipientInputState>) =>
    onChange(recipients.map((item) => (item.uid === uid ? { ...item, ...next } : item)));
  return (
    <div className="grid gap-2" data-testid="compensation-survivor-recipients">
      <DeductionSectionHeader
        title="수급권자별 유족급여 (상속인별 공제)"
        onAdd={() =>
          onChange([
            ...recipients,
            {
              ...emptySurvivorRecipient(),
              // 첫 상속인을 기본으로 골라 둔다. 총액을 옮겨 왔는데 공제가 사라지지 않게 한다.
              heirName: heirNames[0] ?? "",
              amountText: recipients.length === 0 ? firstAmountText : "",
            },
          ])
        }
      />
      <p className="text-xs text-muted-foreground">
        상속인을 입력했다면 수급권자별로 나눠 넣으세요. 유족급여는 수급권자가 상속한 일실수입 몫을
        한도로 그 몫에서만 공제하고, 다른 상속인 몫에서는 빼지 않습니다 (대법원 2009. 5. 21. 선고
        2008다13104 전원합의체). 사실혼 배우자처럼 상속인이 아닌 수급권자는 &quot;상속인
        아님&quot;을 고르면 어느 몫에서도 공제하지 않습니다. 장례비·위자료·전액공제는 상속분대로
        나눕니다 (유족 고유 위자료·장례비 부담자 지정은 아직 지원하지 않습니다).
      </p>
      {duplicateHeirNames ? (
        <p
          role="alert"
          className="text-xs text-red-700 dark:text-red-300"
          data-testid="compensation-duplicate-heir-names"
        >
          상속인 이름이 서로 달라야 수급권자를 지정할 수 있습니다. 같은 이름의 상속인이 있으면
          이름을 구분해 주세요.
        </p>
      ) : null}
      {recipients.map((item) => (
        <div key={item.uid} className="grid grid-cols-[1fr_140px_auto] items-center gap-2">
          <Select
            aria-label="유족급여 수급권자"
            value={item.heirName}
            onChange={(e) => patch(item.uid, { heirName: e.target.value })}
          >
            <option value="">수급권자 선택</option>
            <option value={NON_HEIR_RECIPIENT}>상속인 아님 (공제 없음)</option>
            {item.heirName &&
            item.heirName !== NON_HEIR_RECIPIENT &&
            !heirNames.includes(item.heirName) ? (
              <option value={item.heirName}>{item.heirName} (지금 상속인 목록에 없음)</option>
            ) : null}
            {heirNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Input
            inputMode="numeric"
            placeholder="유족급여 (원)"
            aria-label="수급권자 유족급여"
            value={formatWonInput(item.amountText)}
            onChange={(e) => patch(item.uid, { amountText: parseWonText(e.target.value) })}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="수급권자 삭제"
            onClick={() => onChange(recipients.filter((other) => other.uid !== item.uid))}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <div className="col-span-3 empty:hidden">
            <FieldError message={recipientHeirError(item.heirName, heirNames)} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 계산 기준일 · 노임 적용일 규약 입력. 부상·사망 공용. */
function LaborRateTimingFields({
  value,
  onChange,
  notice,
}: {
  value: LaborRateTimingFormState;
  onChange: (patch: Partial<LaborRateTimingFormState>) => void;
  notice: string | null;
}) {
  return (
    <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-medium">
        계산 기준일
        <Input
          type="date"
          value={value.calculationDate}
          onChange={(e) => onChange({ calculationDate: e.target.value })}
        />
        <span className="text-xs font-normal text-muted-foreground">
          변론종결 예정일. 사고일부터 그날까지 공표된 노임단가가 바뀐 날마다 기간을 나누고(판결
          계산표와 법원 손해배상 계산 프로그램 예시의 방식), 그 뒤 장래분은 그날의 단가를 씁니다
          (대법원 1995. 2. 28. 선고 94다31334: &quot;변론종결 당시의 일반노동임금&quot;). 일당을
          직접 넣으면 나누지 않습니다.
        </span>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        노임 적용일 규약
        <Select
          value={value.laborRateEffectiveRule}
          onChange={(e) =>
            onChange({ laborRateEffectiveRule: e.target.value as LaborRateEffectiveRule })
          }
        >
          <option value="survey">조사 시점 (5/1·9/1부터)</option>
          <option value="published">공표 적용일 (1/1·9/1부터)</option>
        </Select>
        <span className="text-xs font-normal text-muted-foreground">
          조사 시점 규약은 같은 단가를 공표 적용일보다 4개월 앞당겨 씁니다. 확인한 판결 이유의
          계산표(서울중앙지법 2019나48259 등)와 법원 손해배상 계산 프로그램 예시가 이 방식입니다.
        </span>
      </label>
      {notice ? (
        <p
          role="status"
          className="text-xs text-amber-700 sm:col-span-2 dark:text-amber-300"
          data-testid="compensation-legacy-labor-rate-notice"
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function StaleBadge({
  stale,
  effectiveFrom,
  version,
}: {
  stale: StaleBadgeResult;
  effectiveFrom: string;
  version: string;
}) {
  const palette =
    stale.level === "red"
      ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
      : stale.level === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200";
  const Icon = stale.level === "neutral" ? CheckCircle2 : AlertTriangle;
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${palette}`}
      role="status"
      data-testid="compensation-stale-badge"
      data-stale-level={stale.level}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        기준 데이터셋 {version} · 최근 적용일 {effectiveFrom} · 경과 {stale.monthsElapsed}개월
        {stale.message ? ` (${stale.message})` : ""}
      </span>
    </div>
  );
}

/**
 * 결과 카드 기타손해 라인 (개호비 · 치료비 · 보조구 + 소계). 부상·사망 결과 카드 공용.
 * 부모 grid(`grid-cols-2`)에 직접 span 쌍을 흘려보낸다 (Fragment). 개호비 240 cap·치료비/보조구
 * 수치합계 20 cap 적용 시 빨간 배지를 노출한다.
 */
function OtherDamagesResultRows({ otherDamages }: { otherDamages: OtherDamagesResult }) {
  const attendant240Capped =
    otherDamages.attendantCare?.hoffman240CappedAtIndex !== null &&
    otherDamages.attendantCare?.hoffman240CappedAtIndex !== undefined;
  const treatment20Capped = otherDamages.treatment?.valueSum20Capped === true;
  const appliance20Capped = otherDamages.appliance?.valueSum20Capped === true;
  // 수치합계 상한은 항목별로 걸린다. 같은 지출을 쪼개면 상한 여력이 늘어나므로, 쪼갠 것으로
  // 의심되는 조합을 안내한다 (금액은 바꾸지 않는다).
  const splitSuspected =
    otherDamages.treatment?.splitSuspected === true ||
    otherDamages.appliance?.splitSuspected === true;
  return (
    <>
      <span className="text-muted-foreground">개호비</span>
      <span className="text-right" data-testid="compensation-other-attendant">
        {formatWon(otherDamages.attendantCareWon)}
        {attendant240Capped ? (
          <span className="ml-1 text-xs text-red-600 dark:text-red-400">호프만 240 제한</span>
        ) : null}
      </span>
      <span className="text-muted-foreground">치료비</span>
      <span className="text-right" data-testid="compensation-other-treatment">
        {formatWon(otherDamages.treatmentWon)}
        {treatment20Capped ? (
          <span className="ml-1 text-xs text-red-600 dark:text-red-400">수치합계 20 제한</span>
        ) : null}
      </span>
      <span className="text-muted-foreground">보조구</span>
      <span className="text-right" data-testid="compensation-other-appliance">
        {formatWon(otherDamages.applianceWon)}
        {appliance20Capped ? (
          <span className="ml-1 text-xs text-red-600 dark:text-red-400">수치합계 20 제한</span>
        ) : null}
      </span>
      <span className="text-muted-foreground">기타손해 소계</span>
      <span className="text-right" data-testid="compensation-other-subtotal">
        {formatWon(otherDamages.subtotalWon)}
      </span>
      {splitSuspected ? (
        // 금액 신뢰도 경고다. 같은 화면의 다른 경고와 같은 테두리·배경·아이콘을 쓰고,
        // `role="status"` 로 스크린리더에도 알린다 (종전에는 각주처럼 읽히는 한 줄이었다).
        <span
          className="col-span-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
          role="status"
          data-testid="compensation-other-split-warning"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            단가와 주기가 같고 기간이 겹치거나 이어지는 항목이 있습니다. 같은 지출을 나눠 입력하면
            수치합계 상한이 항목마다 따로 걸려 합계가 커집니다. 하나의 지출이라면 한 항목으로 합쳐
            주세요.
          </span>
        </span>
      ) : null}
    </>
  );
}

/**
 * 산재보험급여 공제 행 (일실수입 한도 선공제 — 2021다241618 전합). 부상·사망 결과 카드 공용.
 */
function IndustrialBenefitResultRows({
  industrialBenefit,
  benefitLabel,
}: {
  industrialBenefit: NonNullable<CompensationResult["industrialBenefit"]>;
  benefitLabel: "장해급여·휴업급여" | "유족급여";
}) {
  const capped = industrialBenefit.deductedWon < industrialBenefit.benefitWon;
  return (
    <>
      <span className="text-muted-foreground">산재보험급여 공제 ({benefitLabel})</span>
      <span className="text-right" data-testid="compensation-industrial-benefit">
        {formatWon(industrialBenefit.deductedWon)}
        {capped ? (
          <span className="ml-1 text-xs text-muted-foreground">
            (급여 {formatWon(industrialBenefit.benefitWon)} 중 일실수입 한도)
          </span>
        ) : null}
      </span>
      <span className="text-muted-foreground">공제 후 일실수입</span>
      <span className="text-right" data-testid="compensation-industrial-lost-income-after">
        {formatWon(industrialBenefit.lostIncomeAfterWon)}
      </span>
    </>
  );
}

/**
 * 엔진의 대체 처리 경고 (직종 조사 중단으로 마지막 단가를 이어 씀 등). 금액은 계산됐지만
 * 사용자가 알아야 하는 사실이라 결과 카드 안에 둔다. 문구는 엔진이 만든 그대로.
 */
function EngineWarningRows({
  result,
}: {
  result: CompensationResult | CompensationAutoDeathResult;
}) {
  if (!result.warnings || result.warnings.length === 0) return null;
  return (
    <span
      className="col-span-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
      role="status"
      data-testid="compensation-engine-warnings"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="grid flex-1 gap-1">
        {result.warnings.map((warning, i) => (
          // 직종이 없는 경고(`hoffmanCoverageClamped`)가 여럿이면 code 만으로는 겹친다.
          <span key={`${warning.code}-${warning.occupation ?? ""}-${i}`}>{warning.message}</span>
        ))}
      </span>
    </span>
  );
}

/** 공제 소계 행 (`deductionRows`). 부상·사망 결과 카드 공용. */
function DeductionResultRows({
  result,
}: {
  result: CompensationResult | CompensationAutoDeathResult;
}) {
  return (
    <>
      {deductionRows(result).map(([label, value]) => (
        <Fragment key={label}>
          <span className="text-muted-foreground">{label}</span>
          <span className="text-right">{value}</span>
        </Fragment>
      ))}
    </>
  );
}

/** 위자료 가산·공제 초과분 행. 이 행들까지 더하면 최종 합계(100원 미만 버림 전)가 된다. */
function SolatiumAddedRow({
  result,
}: {
  result: CompensationResult | CompensationAutoDeathResult;
}) {
  return (
    <>
      {solatiumSettlementRows(result).map(([label, value]) => (
        <Fragment key={label}>
          <span className="text-muted-foreground">{label}</span>
          <span
            className="text-right"
            data-testid={label === "위자료 가산" ? "compensation-solatium-added" : undefined}
          >
            {value}
          </span>
        </Fragment>
      ))}
    </>
  );
}

function ResultCards({
  result,
  hospitalMonths,
  courtTruncation,
}: {
  result: CompensationResult;
  hospitalMonths: number;
  courtTruncation: boolean;
}) {
  const hasDates = result.segments.some((segment) => segment.startDate !== undefined);
  return (
    <>
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">계산 결과</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">중복 노동능력상실률</span>
            <span className="text-right">{formatRatioPercent(result.combinedLossRate)}</span>
            {hospitalMonths > 0 ? (
              <span
                className="col-span-2 text-xs text-muted-foreground"
                data-testid="compensation-hospitalization-months"
              >
                {hospitalizationLine(hospitalMonths)}
              </span>
            ) : null}
            {courtTruncation ? (
              <span
                className="col-span-2 text-xs text-muted-foreground"
                data-testid="compensation-court-truncation"
              >
                절사: {COURT_TRUNCATION_TEXT}
              </span>
            ) : null}
            <span className="text-muted-foreground">일실수입 소계</span>
            <span className="text-right">{formatWon(result.lostIncomeSubtotalWon)}</span>
            {result.industrialBenefit !== undefined ? (
              <IndustrialBenefitResultRows
                industrialBenefit={result.industrialBenefit}
                benefitLabel="장해급여·휴업급여"
              />
            ) : null}
            <span className="text-muted-foreground">위자료</span>
            <span className="text-right">{formatWon(result.solatiumWon)}</span>
            <span className="text-muted-foreground">과실상계 대상 소계</span>
            <span className="text-right">{formatWon(result.pecuniaryDamagesSubtotalWon)}</span>
            <span className="text-muted-foreground">
              과실상계 ({formatRatioPercent(result.faultOffset.ratio)})
            </span>
            <span className="text-right">{formatWon(result.faultOffset.afterWon)}</span>
            <DeductionResultRows result={result} />
            {result.deductions.industrialBenefitWon !== undefined ? (
              // legacy — ≤ v0.9.x 로 저장된 .lcalc 결과(과실상계 후 총액 공제)를 그대로 표시.
              <>
                <span className="text-muted-foreground">산재보험급여 공제 (장해급여)</span>
                <span className="text-right" data-testid="compensation-industrial-benefit-legacy">
                  {formatWon(result.deductions.industrialBenefitWon)}
                </span>
              </>
            ) : null}
            <SolatiumAddedRow result={result} />
            <EngineWarningRows result={result} />
            {result.otherDamages !== undefined ? (
              <OtherDamagesResultRows otherDamages={result.otherDamages} />
            ) : null}
            <span className="border-t border-border pt-2 text-base font-semibold">최종 합계</span>
            <span className="border-t border-border pt-2 text-right text-base font-semibold">
              {formatWon(result.finalWon)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">일실수입 구간</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">기간 (개월)</th>
                {hasDates ? <SegmentDateHeaders /> : null}
                <th className="py-2 font-medium">상실률</th>
                <th className="py-2 text-right font-medium">단가 (원/일)</th>
                <th className="py-2 text-right font-medium">호프만 (적용)</th>
                <th className="py-2 text-right font-medium">금액</th>
              </tr>
            </thead>
            <tbody>
              {result.segments.map((segment: CompensationSegment, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td className="py-2">
                    {segment.startMonth} ~ {segment.endMonth}
                  </td>
                  {hasDates ? <SegmentDateCells segment={segment} /> : null}
                  <td className="py-2">{formatRatioPercent(segment.lossRate)}</td>
                  <td className="py-2 text-right">{formatWon(segment.dailyWageWon)}</td>
                  <td className="py-2 text-right">
                    {segment.appliedHoffman.toFixed(6)}
                    {result.hoffman240Cap.cappedAtIndex === i ? (
                      <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">
                        (한도)
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-right">{formatWon(segment.amountFloorWon)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.hoffman240Cap.cappedAtIndex !== null ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              호프만 240 한도 적용. {result.hoffman240Cap.cappedAtIndex + 1}번째 구간부터 누적치가
              240을 초과해 한도를 적용했습니다.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-2 p-4 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="font-medium text-foreground">데이터 버전</dt>
            <dd>
              {result.dataVersions.laborRates} · {result.dataVersions.lifeExpectancy} ·{" "}
              {result.dataVersions.hoffman} · {result.dataVersions.leibniz}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">계산 시각</dt>
            <dd>{formatComputedAt(result.computedAt)}</dd>
          </div>
        </CardContent>
      </Card>

      <div
        className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
        data-testid="compensation-disclaimer"
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{result.disclaimer || STANDARD_DISCLAIMER}</span>
      </div>
    </>
  );
}

interface ActionButtonProps {
  action: ActionName;
  icon: LucideIcon;
  label: string;
  loadingAction: ActionName | null;
  requiresResult: boolean;
  resultReady: boolean;
  onClick: () => Promise<void>;
}

function ActionButton({
  action,
  icon: Icon,
  label,
  loadingAction,
  requiresResult,
  resultReady,
  onClick,
}: ActionButtonProps) {
  const isLoading = loadingAction === action;
  const isBusy = loadingAction !== null;

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isBusy || (requiresResult && !resultReady)}
      onClick={() => {
        void onClick();
      }}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="h-4 w-4" aria-hidden="true" />
      )}
      {label}
    </Button>
  );
}

function ToastMessage({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  const Icon = toast.type === "success" ? CheckCircle2 : XCircle;
  const color =
    toast.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
      : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200";

  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${color}`}
      role="status"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        aria-label="알림 닫기"
        className="rounded-sm p-0.5 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onDismiss}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
