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
import { useEffect, useMemo, useRef, useState } from "react";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";
import {
  computeCompensation,
  computeCompensationDeath,
  type CompensationAbsoluteDeduction,
  type CompensationAutoDeathInput,
  type CompensationAutoDeathResult,
  type CompensationInput,
  type CompensationRatioDeduction,
  type CompensationResult,
  type CompensationSegment,
  type OtherDamagesResult,
  type PermanentDisabilityInput,
  type TemporaryDisabilityInput,
} from "@lawcalc-kr/compensation";
import {
  computeStaleBadge,
  laborRatesDatasetVersionTag,
  latestSliceEffectiveFrom,
  loadLaborRatesTable,
  type StaleBadgeResult,
} from "@lawcalc-kr/datasets-compensation";

import {
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
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { useFormShortcuts } from "../hooks/use-form-shortcuts";
import { formatWon, formatWonInput, parseWonAmount, parseWonText } from "../lib/format-won";
import { ipc, type LcalcCompensationPayload, type LcalcFile } from "../lib/ipc";
import { useCaseSlot } from "../lib/case-file";
import { createLcalcDirtySnapshot, useLcalcDirtyTracker } from "../lib/lcalc-dirty-state";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "../lib/lcalc-migrations";
import { parseLoadedCompensationLcalcInput, validateLcalcEnvelope } from "../lib/lcalc-validation";

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

export interface RatioDeductionInputState {
  uid: string;
  label: string;
  ratioText: string;
}

export interface AbsoluteDeductionInputState {
  uid: string;
  label: string;
  amountText: string;
}

export interface CompensationFormState {
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
  ratioDeductions: RatioDeductionInputState[];
  absoluteDeductions: AbsoluteDeductionInputState[];
  /** 산재(산×부상) 장해급여 (원). accidentType === "industrial" 일 때만 적용. */
  disabilityBenefitWonText: string;
  /** 기타손해 (개호비·치료비·보조구). 미입력 시 결과 회귀 0. */
  otherDamages: OtherDamagesFormState;
}

const DEFAULT_OCCUPATION = "보통인부";
const DEFAULT_RETIREMENT_AGE = 65;
const DEFAULT_WORKING_DAYS = 22;

const LABOR_RATES_DATASET = loadLaborRatesTable();
const LABOR_RATES_VERSION_TAG = laborRatesDatasetVersionTag(LABOR_RATES_DATASET);
const LATEST_LABOR_RATES_SLICE = latestSliceEffectiveFrom(LABOR_RATES_DATASET);
const LABOR_RATES_SNAPSHOT_DATE = LABOR_RATES_DATASET.snapshotDate;
const OCCUPATION_OPTIONS = (() => {
  const latestSlice =
    LABOR_RATES_DATASET.slices[LABOR_RATES_DATASET.slices.length - 1]?.rates ?? {};
  const list = Object.keys(latestSlice).sort((a, b) => a.localeCompare(b, "ko-KR"));
  if (!list.includes(DEFAULT_OCCUPATION)) {
    list.unshift(DEFAULT_OCCUPATION);
  }
  return list;
})();

function newUid(): string {
  return crypto.randomUUID();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseRatio(text: string, fallback = 0): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return fallback;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : fallback;
}

function parsePositiveIntText(text: string, fallback: number): number {
  const digits = text.replaceAll(",", "").trim();
  if (digits.length === 0) return fallback;
  const value = Number(digits);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function emptyPermanent(): PermanentInputState {
  return { uid: newUid(), department: "", ratioText: "" };
}

export function emptyTemporary(): TemporaryInputState {
  return { uid: newUid(), department: "", ratioText: "", yearsText: "" };
}

export function emptyRatioDeduction(): RatioDeductionInputState {
  return { uid: newUid(), label: "", ratioText: "" };
}

export function emptyAbsoluteDeduction(): AbsoluteDeductionInputState {
  return { uid: newUid(), label: "", amountText: "" };
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
    ratioDeductions: [],
    absoluteDeductions: [],
    disabilityBenefitWonText: "",
    otherDamages: defaultOtherDamagesFormState(),
  };
}

export function buildCompensationInput(state: CompensationFormState): CompensationInput {
  const permanent: PermanentDisabilityInput[] = state.permanent
    .map((item) => {
      const ratio = parseRatio(item.ratioText, 0);
      const node: PermanentDisabilityInput = { ratio };
      const department = item.department.trim();
      if (department.length > 0) node.department = department;
      return node;
    })
    .filter((item) => item.ratio > 0 && item.ratio <= 1);

  const temporary: TemporaryDisabilityInput[] = state.temporary
    .map((item) => {
      const ratio = parseRatio(item.ratioText, 0);
      const years = parseRatio(item.yearsText, 0);
      const node: TemporaryDisabilityInput = { ratio, years };
      const department = item.department.trim();
      if (department.length > 0) node.department = department;
      return node;
    })
    .filter((item) => item.ratio > 0 && item.ratio <= 1 && item.years > 0);

  const ratioDeductions: CompensationRatioDeduction[] = state.ratioDeductions
    .map((item) => {
      const ratio = parseRatio(item.ratioText, 0);
      const node: CompensationRatioDeduction = { ratio };
      const label = item.label.trim();
      if (label.length > 0) node.label = label;
      return node;
    })
    .filter((item) => item.ratio > 0);

  const absoluteDeductions: CompensationAbsoluteDeduction[] = state.absoluteDeductions
    .map((item) => {
      const amount = parseWonAmount(item.amountText, 0);
      const node: CompensationAbsoluteDeduction = { amount };
      const label = item.label.trim();
      if (label.length > 0) node.label = label;
      return node;
    })
    .filter((item) => item.amount > 0);

  const retirementAge = parsePositiveIntText(state.retirementAgeText, DEFAULT_RETIREMENT_AGE);
  const workingDaysPerMonth = parsePositiveIntText(
    state.workingDaysPerMonthText,
    DEFAULT_WORKING_DAYS,
  );

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
  const priorImpairment = parseRatio(state.priorImpairmentRatioText, 0);
  if (priorImpairment > 0) lossRate.priorImpairmentRatio = priorImpairment;

  const input: CompensationInput = {
    base: {
      birthDate: state.birthDate,
      accidentDate: state.accidentDate,
      treatmentEndDate: state.treatmentEndDate,
      sex: state.sex,
      retirementAge,
      legalRatePreset: "civil",
    },
    lossRate,
    lostIncome,
  };

  const solatium = parseWonAmount(state.solatiumWonText, 0);
  if (solatium > 0) input.solatiumWon = solatium;
  const fault = parseRatio(state.faultRatioText, 0);
  if (fault > 0) input.faultRatio = fault;
  if (ratioDeductions.length > 0 || absoluteDeductions.length > 0) {
    input.deductions = {};
    if (ratioDeductions.length > 0) input.deductions.ratio = ratioDeductions;
    if (absoluteDeductions.length > 0) input.deductions.absolute = absoluteDeductions;
  }
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
      ratioText: String(item.ratio),
    })),
    temporary: (input.lossRate.temporary ?? []).map((item) => ({
      uid: newUid(),
      department: item.department ?? "",
      ratioText: String(item.ratio),
      yearsText: String(item.years),
    })),
    priorImpairmentRatioText:
      input.lossRate.priorImpairmentRatio === undefined
        ? ""
        : String(input.lossRate.priorImpairmentRatio),
    occupation: input.lostIncome.occupation ?? "",
    directWageWonText:
      input.lostIncome.directWageWon === undefined ? "" : String(input.lostIncome.directWageWon),
    workingDaysPerMonthText: String(input.lostIncome.workingDaysPerMonth ?? DEFAULT_WORKING_DAYS),
    solatiumWonText: input.solatiumWon === undefined ? "" : String(input.solatiumWon),
    faultRatioText: input.faultRatio === undefined ? "" : String(input.faultRatio),
    ratioDeductions: (input.deductions?.ratio ?? []).map((item) => ({
      uid: newUid(),
      label: item.label ?? "",
      ratioText: String(item.ratio),
    })),
    absoluteDeductions: (input.deductions?.absolute ?? []).map((item) => ({
      uid: newUid(),
      label: item.label ?? "",
      amountText: String(item.amount),
    })),
    disabilityBenefitWonText:
      input.industrialInsurance?.disabilityBenefitWon === undefined
        ? ""
        : String(input.industrialInsurance.disabilityBenefitWon),
    otherDamages: applyOtherDamagesInput(input.otherDamages),
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
    occupation: state.occupation,
    directWageWonText: state.directWageWonText,
    workingDaysPerMonthText: state.workingDaysPerMonthText,
    solatiumWonText: state.solatiumWonText,
    faultRatioText: state.faultRatioText,
    ratioDeductions: state.ratioDeductions.map((item) => ({
      label: item.label,
      ratioText: item.ratioText,
    })),
    absoluteDeductions: state.absoluteDeductions.map((item) => ({
      label: item.label,
      amountText: item.amountText,
    })),
    otherDamages: otherDamagesForDirtySnapshot(state.otherDamages),
  };
}

function buildCompensationDirtySnapshot(state: CompensationFormState, note: string) {
  return createLcalcDirtySnapshot({ state: stateForDirtySnapshot(state), note });
}

export function formatCompensationForClipboard(result: CompensationResult): string {
  const segmentRows = result.segments
    .map(
      (segment, i) =>
        `${i + 1}\t${segment.startMonth}~${segment.endMonth}개월\t${formatRatioPercent(
          segment.lossRate,
        )}\t${formatWon(segment.dailyWageWon)}/일\t호프만 ${segment.appliedHoffman.toFixed(
          6,
        )}\t${formatWon(segment.amountFloorWon)}`,
    )
    .join("\n");

  const lines = [
    result.accidentType === "industrial"
      ? "LawCalc Korea 산재 사고 부상 손해배상 계산 결과"
      : "LawCalc Korea 자동차 사고 부상 손해배상 계산 결과",
    `중복장해율: ${formatRatioPercent(result.combinedLossRate)}`,
    `일실수입 소계: ${formatWon(result.lostIncomeSubtotalWon)}`,
    `위자료: ${formatWon(result.solatiumWon)}`,
    `과실상계 대상 소계: ${formatWon(result.pecuniaryDamagesSubtotalWon)}`,
    `과실상계 (${formatRatioPercent(result.faultOffset.ratio)} 후): ${formatWon(result.faultOffset.afterWon)}`,
    `비율공제 소계: ${formatWon(result.deductions.ratioSubtotalWon)}`,
    `전액공제 소계: ${formatWon(result.deductions.absoluteSubtotalWon)}`,
  ];
  if (result.deductions.industrialBenefitWon !== undefined) {
    lines.push(
      `산재보험급여 공제 (장해급여): ${formatWon(result.deductions.industrialBenefitWon)}`,
    );
  }
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
    "",
    STANDARD_DISCLAIMER,
  );
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
    // 기타손해(otherDamages) 있으면 @4, 없으면 산재(산×부상)=@3 / 자동차(자×부상)=@1 (회귀 0).
    // max-feature: otherDamages > industrial.
    envelopeFeatures: [
      input.otherDamages !== undefined
        ? "compensation@4"
        : input.accidentType === "industrial"
          ? "compensation@3"
          : "compensation@1",
    ],
    dataVersions: {
      laborRates: result.dataVersions.laborRates,
      lifeExpectancy: result.dataVersions.lifeExpectancy,
      hoffman: result.dataVersions.hoffman,
      leibniz: result.dataVersions.leibniz,
    },
    payload,
  };
}

export interface CompensationDeathFormState {
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
  ratioDeductions: RatioDeductionInputState[];
  absoluteDeductions: AbsoluteDeductionInputState[];
  /** 산재(산×사망) 유족급여 (원). accidentType === "industrial" 일 때만 적용. */
  survivorBenefitWonText: string;
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

const DEFAULT_LIVING_COST_DEDUCTION_RATIO = "0.3333";

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
    ratioDeductions: [],
    absoluteDeductions: [],
    survivorBenefitWonText: "",
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
  const retirementAge = parsePositiveIntText(state.retirementAgeText, DEFAULT_RETIREMENT_AGE);
  const workingDaysPerMonth = parsePositiveIntText(
    state.workingDaysPerMonthText,
    DEFAULT_WORKING_DAYS,
  );

  const occupation = state.occupation.trim();
  const directWageWon = parseWonAmount(state.directWageWonText, 0);
  const lostIncome: CompensationAutoDeathInput["lostIncome"] = {
    discountMethod: "hoffman",
    workingDaysPerMonth,
  };
  if (occupation.length > 0) lostIncome.occupation = occupation;
  if (directWageWon > 0) lostIncome.directWageWon = directWageWon;

  const ratioDeductions: CompensationRatioDeduction[] = state.ratioDeductions
    .map((item) => {
      const ratio = parseRatio(item.ratioText, 0);
      const node: CompensationRatioDeduction = { ratio };
      const label = item.label.trim();
      if (label.length > 0) node.label = label;
      return node;
    })
    .filter((item) => item.ratio > 0);

  const absoluteDeductions: CompensationAbsoluteDeduction[] = state.absoluteDeductions
    .map((item) => {
      const amount = parseWonAmount(item.amountText, 0);
      const node: CompensationAbsoluteDeduction = { amount };
      const label = item.label.trim();
      if (label.length > 0) node.label = label;
      return node;
    })
    .filter((item) => item.amount > 0);

  const input: CompensationAutoDeathInput = {
    mode: "death",
    base: {
      birthDate: state.birthDate,
      accidentDate: state.accidentDate,
      sex: state.sex,
      retirementAge,
    },
    lostIncome,
  };

  const livingCost = parseRatio(state.livingCostDeductionRatioText, -1);
  if (livingCost >= 0 && livingCost <= 1) input.livingCostDeductionRatio = livingCost;
  const funeral = parseWonAmount(state.funeralExpenseWonText, DEFAULT_FUNERAL_EXPENSE);
  input.funeralExpenseWon = funeral;
  const solatium = parseWonAmount(state.solatiumWonText, 0);
  if (solatium > 0) input.solatiumWon = solatium;
  const fault = parseRatio(state.faultRatioText, 0);
  if (fault > 0) input.faultRatio = fault;
  if (ratioDeductions.length > 0 || absoluteDeductions.length > 0) {
    input.deductions = {};
    if (ratioDeductions.length > 0) input.deductions.ratio = ratioDeductions;
    if (absoluteDeductions.length > 0) input.deductions.absolute = absoluteDeductions;
  }
  if (state.accidentType === "industrial") {
    input.accidentType = "industrial";
    const survivor = parseWonAmount(state.survivorBenefitWonText, 0);
    if (survivor > 0) input.industrialInsurance = { survivorBenefitWon: survivor };
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
        : String(input.livingCostDeductionRatio),
    funeralExpenseWonText: String(input.funeralExpenseWon ?? DEFAULT_FUNERAL_EXPENSE),
    solatiumWonText: input.solatiumWon === undefined ? "" : String(input.solatiumWon),
    faultRatioText: input.faultRatio === undefined ? "" : String(input.faultRatio),
    ratioDeductions: (input.deductions?.ratio ?? []).map((item) => ({
      uid: newUid(),
      label: item.label ?? "",
      ratioText: String(item.ratio),
    })),
    absoluteDeductions: (input.deductions?.absolute ?? []).map((item) => ({
      uid: newUid(),
      label: item.label ?? "",
      amountText: String(item.amount),
    })),
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

export function formatCompensationDeathForClipboard(result: CompensationAutoDeathResult): string {
  const segmentRows = result.segments
    .map(
      (segment, i) =>
        `${i + 1}\t${segment.startMonth}~${segment.endMonth}개월\t${formatWon(
          segment.dailyWageWon,
        )}/일\t호프만 ${segment.appliedHoffman.toFixed(6)}\t${formatWon(segment.amountFloorWon)}`,
    )
    .join("\n");

  const lines = [
    result.accidentType === "industrial"
      ? "LawCalc Korea 산재 사고 사망 손해배상 계산 결과"
      : "LawCalc Korea 자동차 사고 사망 손해배상 계산 결과",
    `생계비 공제 비율: ${formatRatioPercent(result.livingCostDeductionRatio)}`,
    `일실수입 소계 (생계비 공제 후): ${formatWon(result.lostIncomeSubtotalWon)}`,
    `위자료: ${formatWon(result.solatiumWon)}`,
    `장례비: ${formatWon(result.funeralExpenseWon)}`,
    `과실상계 대상 소계: ${formatWon(result.pecuniaryDamagesSubtotalWon)}`,
    `과실상계 (${formatRatioPercent(result.faultOffset.ratio)} 후): ${formatWon(result.faultOffset.afterWon)}`,
    `비율공제 소계: ${formatWon(result.deductions.ratioSubtotalWon)}`,
    `전액공제 소계: ${formatWon(result.deductions.absoluteSubtotalWon)}`,
  ];
  if (result.deductions.industrialBenefitWon !== undefined) {
    lines.push(
      `산재보험급여 공제 (유족급여): ${formatWon(result.deductions.industrialBenefitWon)}`,
    );
  }
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
    lines.push("", "상속인\t지분(약분)\t배정 금액");
    lines.push(
      result.inheritanceShares
        .map(
          (share) =>
            `${share.name}\t${share.numerator}/${share.denominator}\t${formatWon(share.amountWon)}`,
        )
        .join("\n"),
    );
  }

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
    // 기타손해(otherDamages) 있으면 @4, 없으면 산재(산×사망)=@3 / 자동차(자×사망)=@2 (회귀 0).
    // max-feature: otherDamages > industrial.
    envelopeFeatures: [
      input.otherDamages !== undefined
        ? "compensation@4"
        : input.accidentType === "industrial"
          ? "compensation@3"
          : "compensation@2",
    ],
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
    ratioDeductions: state.ratioDeductions.map((item) => ({
      label: item.label,
      ratioText: item.ratioText,
    })),
    absoluteDeductions: state.absoluteDeductions.map((item) => ({
      label: item.label,
      amountText: item.amountText,
    })),
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
 * 전체 5탭 구조는 유지하며, 6번째 탭을 만들지 않는다 (plan §4 결정 3).
 */
/** 사건 파일에서 꺼낸 compensation envelope 가 사망 모드인지 판별한다. */
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
 * 부상/사망 inner view 공용 props. 사건 파일 적용 시 모드가 다르면
 * `onApplyOtherMode` 로 wrapper 에 모드 전환을 요청하고, 전환된 view 가
 * mount 시점에 `pendingCaseFileRef` 를 소비한다.
 */
interface CompensationViewProps {
  active?: boolean;
  pendingCaseFileRef?: React.MutableRefObject<LcalcFile | null>;
  onApplyOtherMode?: (target: CompensationMode, file: LcalcFile) => void;
}

export function CompensationCalculator({ active = true }: { active?: boolean }) {
  const [mode, setMode] = useState<CompensationMode>("injury");
  const pendingCaseFileRef = useRef<LcalcFile | null>(null);

  const requestModeForCaseFile = (target: CompensationMode, file: LcalcFile) => {
    pendingCaseFileRef.current = file;
    setMode(target);
  };

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
      {mode === "injury" ? (
        <InjuryCompensationView
          active={active}
          pendingCaseFileRef={pendingCaseFileRef}
          onApplyOtherMode={requestModeForCaseFile}
        />
      ) : (
        <DeathCompensationView
          active={active}
          pendingCaseFileRef={pendingCaseFileRef}
          onApplyOtherMode={requestModeForCaseFile}
        />
      )}
    </div>
  );
}

function InjuryCompensationView({
  active = true,
  pendingCaseFileRef,
  onApplyOtherMode,
}: CompensationViewProps) {
  const [state, setState] = useState<CompensationFormState>(defaultCompensationFormState);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<CompensationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<ActionName | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const stale = useMemo<StaleBadgeResult>(
    () => computeStaleBadge(LABOR_RATES_SNAPSHOT_DATE, todayIso()),
    [],
  );

  const dirtySnapshot = useMemo(() => buildCompensationDirtySnapshot(state, note), [state, note]);
  const markCompensationClean = useLcalcDirtyTracker("compensation", dirtySnapshot);
  const pristineSnapshotRef = useRef(dirtySnapshot);

  const update = (patch: Partial<CompensationFormState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  const handleCalculate = () => {
    try {
      const input = buildCompensationInput(state);
      const calculated = computeCompensation(input);
      setResult(calculated);
      setError(null);
      setToast(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReset = () => {
    setState(defaultCompensationFormState());
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
      if (!result) throw new Error("계산 후 복사해 주세요.");
      await ipc.copyToClipboard(formatCompensationForClipboard(result));
      return "손해배상 계산 결과를 클립보드에 복사했습니다.";
    });

  const handleExportPdf = () =>
    runAction("pdf", async () => {
      if (!result) throw new Error("계산 후 PDF를 저장해 주세요.");
      const path = await ipc.exportCompensationPdf(result);
      return path ? `PDF 파일을 저장했습니다: ${path}` : null;
    });

  const handleExportCsv = () =>
    runAction("csv", async () => {
      if (!result) throw new Error("계산 후 CSV를 저장해 주세요.");
      const path = await ipc.exportCompensationCsv(result);
      return path ? `CSV 파일을 저장했습니다: ${path}` : null;
    });

  const handleSaveLcalc = () =>
    runAction("save", async () => {
      if (!result) throw new Error("계산 후 .lcalc 파일을 저장해 주세요.");
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
    const loadedNote = loaded.note ?? "";
    setState(appliedState);
    setNote(loadedNote);
    const loadedResult =
      loaded.result !== undefined && loaded.result.mode !== "death"
        ? loaded.result
        : computeCompensation(injuryInput);
    setResult(loadedResult);
    setError(null);
    markCompensationClean(buildCompensationDirtySnapshot(appliedState, loadedNote));
  };

  const applyLoadedFileRef = useRef(applyLoadedFile);
  useEffect(() => {
    applyLoadedFileRef.current = applyLoadedFile;
  });
  useEffect(() => {
    const pending = pendingCaseFileRef?.current;
    if (pending && !isDeathCompensationLcalcFile(pending)) {
      pendingCaseFileRef.current = null;
      applyLoadedFileRef.current(pending);
    }
  }, [pendingCaseFileRef]);

  useCaseSlot("compensation", {
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
    apply: (file) => {
      if (isDeathCompensationLcalcFile(file) && onApplyOtherMode) {
        onApplyOtherMode("death", file);
        return;
      }
      applyLoadedFile(file);
    },
    markSaved: () => markCompensationClean(),
    reset: handleReset,
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

  const addRatioDeduction = () =>
    update({ ratioDeductions: [...state.ratioDeductions, emptyRatioDeduction()] });
  const removeRatioDeduction = (uid: string) =>
    update({ ratioDeductions: state.ratioDeductions.filter((item) => item.uid !== uid) });
  const updateRatioDeduction = (uid: string, patch: Partial<RatioDeductionInputState>) =>
    update({
      ratioDeductions: state.ratioDeductions.map((item) =>
        item.uid === uid ? { ...item, ...patch } : item,
      ),
    });

  const addAbsoluteDeduction = () =>
    update({ absoluteDeductions: [...state.absoluteDeductions, emptyAbsoluteDeduction()] });
  const removeAbsoluteDeduction = (uid: string) =>
    update({
      absoluteDeductions: state.absoluteDeductions.filter((item) => item.uid !== uid),
    });
  const updateAbsoluteDeduction = (uid: string, patch: Partial<AbsoluteDeductionInputState>) =>
    update({
      absoluteDeductions: state.absoluteDeductions.map((item) =>
        item.uid === uid ? { ...item, ...patch } : item,
      ),
    });

  const overrideEmphasis = stale.overrideStrongly
    ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
    : "";

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
                  onChange={(e) => update({ accidentDate: e.target.value })}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                치료종료일
                <Input
                  type="date"
                  value={state.treatmentEndDate}
                  onChange={(e) => update({ treatmentEndDate: e.target.value })}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                가동연한 (만 나이)
                <Input
                  inputMode="numeric"
                  value={state.retirementAgeText}
                  onChange={(e) => update({ retirementAgeText: e.target.value })}
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
            </label>
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
                {OCCUPATION_OPTIONS.map((occupation) => (
                  <option key={occupation} value={occupation}>
                    {occupation}
                  </option>
                ))}
              </Select>
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
            </label>
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
                  장해급여 (원) — 과실상계 후 공제
                  <Input
                    inputMode="numeric"
                    placeholder="예: 50,000,000"
                    value={formatWonInput(state.disabilityBenefitWonText)}
                    onChange={(e) =>
                      update({ disabilityBenefitWonText: parseWonText(e.target.value) })
                    }
                    data-testid="compensation-disability-benefit-input"
                  />
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
              </label>
            </div>

            <div className="grid gap-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">비율공제</span>
                <Button variant="outline" size="sm" type="button" onClick={addRatioDeduction}>
                  <Plus className="mr-1 h-3 w-3" />
                  추가
                </Button>
              </div>
              {state.ratioDeductions.map((item) => (
                <div key={item.uid} className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
                  <Input
                    placeholder="비고"
                    value={item.label}
                    onChange={(e) => updateRatioDeduction(item.uid, { label: e.target.value })}
                  />
                  <Input
                    inputMode="decimal"
                    placeholder="비율 (0~1)"
                    value={item.ratioText}
                    onChange={(e) => updateRatioDeduction(item.uid, { ratioText: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="비율공제 삭제"
                    onClick={() => removeRatioDeduction(item.uid)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  전액공제 (치료비 · 선급금 등)
                </span>
                <Button variant="outline" size="sm" type="button" onClick={addAbsoluteDeduction}>
                  <Plus className="mr-1 h-3 w-3" />
                  추가
                </Button>
              </div>
              {state.absoluteDeductions.map((item) => (
                <div key={item.uid} className="grid grid-cols-[1fr_140px_auto] items-center gap-2">
                  <Input
                    placeholder="비고"
                    value={item.label}
                    onChange={(e) => updateAbsoluteDeduction(item.uid, { label: e.target.value })}
                  />
                  <Input
                    inputMode="numeric"
                    placeholder="금액 (원)"
                    value={formatWonInput(item.amountText)}
                    onChange={(e) =>
                      updateAbsoluteDeduction(item.uid, {
                        amountText: parseWonText(e.target.value),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="전액공제 삭제"
                    onClick={() => removeAbsoluteDeduction(item.uid)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

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

        {error ? (
          <div
            className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
            role="alert"
          >
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {result ? <ResultCards result={result} /> : null}

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
                resultReady={result !== null}
                onClick={handleExportPdf}
              />
              <ActionButton
                action="csv"
                icon={FileSpreadsheet}
                label="CSV"
                loadingAction={loadingAction}
                requiresResult
                resultReady={result !== null}
                onClick={handleExportCsv}
              />
              <ActionButton
                action="copy"
                icon={Clipboard}
                label="복사"
                loadingAction={loadingAction}
                requiresResult
                resultReady={result !== null}
                onClick={handleCopy}
              />
              <ActionButton
                action="save"
                icon={FileJson}
                label=".lcalc 저장"
                loadingAction={loadingAction}
                requiresResult
                resultReady={result !== null}
                onClick={handleSaveLcalc}
              />
              <ActionButton
                action="load"
                icon={FileJson}
                label=".lcalc 열기"
                loadingAction={loadingAction}
                requiresResult={false}
                resultReady={result !== null}
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
                자동차 사고 사망은 상단 "자동차 사고 · 사망" 탭에서 계산합니다. 산재,
                기타손해(개호비 등)는 후속 버전에서 다룹니다.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

function DeathCompensationView({
  active = true,
  pendingCaseFileRef,
  onApplyOtherMode,
}: CompensationViewProps) {
  const [state, setState] = useState<CompensationDeathFormState>(defaultCompensationDeathFormState);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<CompensationAutoDeathResult | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const markCompensationClean = useLcalcDirtyTracker("compensation", dirtySnapshot);
  const pristineSnapshotRef = useRef(dirtySnapshot);

  const update = (patch: Partial<CompensationDeathFormState>) =>
    setState((prev) => ({ ...prev, ...patch }));

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
      if (!result) throw new Error("계산 후 복사해 주세요.");
      await ipc.copyToClipboard(formatCompensationDeathForClipboard(result));
      return "사망 손해배상 계산 결과를 클립보드에 복사했습니다.";
    });

  const handleExportPdf = () =>
    runAction("pdf", async () => {
      if (!result) throw new Error("계산 후 PDF를 저장해 주세요.");
      const path = await ipc.exportCompensationDeathPdf(result);
      return path ? `PDF 파일을 저장했습니다: ${path}` : null;
    });

  const handleExportCsv = () =>
    runAction("csv", async () => {
      if (!result) throw new Error("계산 후 CSV를 저장해 주세요.");
      const path = await ipc.exportCompensationDeathCsv(result);
      return path ? `CSV 파일을 저장했습니다: ${path}` : null;
    });

  const handleSaveLcalc = () =>
    runAction("save", async () => {
      if (!result) throw new Error("계산 후 .lcalc 파일을 저장해 주세요.");
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
    const loadedNote = loaded.note ?? "";
    setState(appliedState);
    setNote(loadedNote);
    const loadedResult =
      loaded.result?.mode === "death" ? loaded.result : computeCompensationDeath(loaded.input);
    setResult(loadedResult);
    setError(null);
    markCompensationClean(buildCompensationDeathDirtySnapshot(appliedState, loadedNote));
  };

  const applyLoadedFileRef = useRef(applyLoadedFile);
  useEffect(() => {
    applyLoadedFileRef.current = applyLoadedFile;
  });
  useEffect(() => {
    const pending = pendingCaseFileRef?.current;
    if (pending && isDeathCompensationLcalcFile(pending)) {
      pendingCaseFileRef.current = null;
      applyLoadedFileRef.current(pending);
    }
  }, [pendingCaseFileRef]);

  useCaseSlot("compensation", {
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
    apply: (file) => {
      if (!isDeathCompensationLcalcFile(file) && onApplyOtherMode) {
        onApplyOtherMode("injury", file);
        return;
      }
      applyLoadedFile(file);
    },
    markSaved: () => markCompensationClean(),
    reset: handleReset,
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

  const addRatioDeduction = () =>
    update({ ratioDeductions: [...state.ratioDeductions, emptyRatioDeduction()] });
  const removeRatioDeduction = (uid: string) =>
    update({ ratioDeductions: state.ratioDeductions.filter((item) => item.uid !== uid) });
  const updateRatioDeduction = (uid: string, patch: Partial<RatioDeductionInputState>) =>
    update({
      ratioDeductions: state.ratioDeductions.map((item) =>
        item.uid === uid ? { ...item, ...patch } : item,
      ),
    });

  const addAbsoluteDeduction = () =>
    update({ absoluteDeductions: [...state.absoluteDeductions, emptyAbsoluteDeduction()] });
  const removeAbsoluteDeduction = (uid: string) =>
    update({
      absoluteDeductions: state.absoluteDeductions.filter((item) => item.uid !== uid),
    });
  const updateAbsoluteDeduction = (uid: string, patch: Partial<AbsoluteDeductionInputState>) =>
    update({
      absoluteDeductions: state.absoluteDeductions.map((item) =>
        item.uid === uid ? { ...item, ...patch } : item,
      ),
    });

  const overrideEmphasis = stale.overrideStrongly
    ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
    : "";

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
                  onChange={(e) => update({ accidentDate: e.target.value })}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                가동연한 (만 나이)
                <Input
                  inputMode="numeric"
                  value={state.retirementAgeText}
                  onChange={(e) => update({ retirementAgeText: e.target.value })}
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
                {OCCUPATION_OPTIONS.map((occupation) => (
                  <option key={occupation} value={occupation}>
                    {occupation}
                  </option>
                ))}
              </Select>
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
              </label>
              <label className="grid gap-2 text-sm font-medium">
                생계비 공제 비율 (0~1)
                <Input
                  inputMode="decimal"
                  placeholder="예: 0.3333"
                  value={state.livingCostDeductionRatioText}
                  onChange={(e) => update({ livingCostDeductionRatioText: e.target.value })}
                />
              </label>
            </div>
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
              {state.accidentType === "industrial" ? (
                <label className="grid gap-2 text-sm font-medium">
                  유족급여 (원) — 과실상계 후 공제
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
              </label>
            </div>

            <div className="grid gap-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">비율공제</span>
                <Button variant="outline" size="sm" type="button" onClick={addRatioDeduction}>
                  <Plus className="mr-1 h-3 w-3" />
                  추가
                </Button>
              </div>
              {state.ratioDeductions.map((item) => (
                <div key={item.uid} className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
                  <Input
                    placeholder="비고"
                    value={item.label}
                    onChange={(e) => updateRatioDeduction(item.uid, { label: e.target.value })}
                  />
                  <Input
                    inputMode="decimal"
                    placeholder="비율 (0~1)"
                    value={item.ratioText}
                    onChange={(e) => updateRatioDeduction(item.uid, { ratioText: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="비율공제 삭제"
                    onClick={() => removeRatioDeduction(item.uid)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  전액공제 (선급금 · 보험금 등)
                </span>
                <Button variant="outline" size="sm" type="button" onClick={addAbsoluteDeduction}>
                  <Plus className="mr-1 h-3 w-3" />
                  추가
                </Button>
              </div>
              {state.absoluteDeductions.map((item) => (
                <div key={item.uid} className="grid grid-cols-[1fr_140px_auto] items-center gap-2">
                  <Input
                    placeholder="비고"
                    value={item.label}
                    onChange={(e) => updateAbsoluteDeduction(item.uid, { label: e.target.value })}
                  />
                  <Input
                    inputMode="numeric"
                    placeholder="금액 (원)"
                    value={formatWonInput(item.amountText)}
                    onChange={(e) =>
                      updateAbsoluteDeduction(item.uid, {
                        amountText: parseWonText(e.target.value),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="전액공제 삭제"
                    onClick={() => removeAbsoluteDeduction(item.uid)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

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
                  title="1순위 — 직계비속"
                  hint="자녀·손자녀 등. 사망 시 그 직계비속 (망인의 손자녀) 이 1차 대습."
                  heirs={state.linealDescendants}
                  onChange={(heirs) => update({ linealDescendants: heirs })}
                  allowRepresentation={true}
                  defaultLabel="자녀"
                />
                <HeirGroupCard
                  title="2순위 — 직계존속"
                  hint="최근친만 입력하세요 — 부모가 있으면 조부모는 비워 두세요 (제1000조②). 입력한 직계존속은 균분 처리되므로 촌수가 다른 분을 함께 넣으면 안 됩니다. 1순위 부재 시에만 참여."
                  heirs={state.linealAscendants}
                  onChange={(heirs) => update({ linealAscendants: heirs })}
                  allowRepresentation={false}
                  defaultLabel="직계존속"
                />
                <HeirGroupCard
                  title="3순위 — 형제자매"
                  hint="1·2순위·배우자 모두 부재 시에만. 사망 시 조카가 1차 대습 가능."
                  heirs={state.siblings}
                  onChange={(heirs) => update({ siblings: heirs })}
                  allowRepresentation={true}
                  defaultLabel="형제자매"
                />
                <HeirGroupCard
                  title="4순위 — 4촌 이내 방계혈족"
                  hint="1·2·3순위·배우자 모두 부재 시에만. 최근친만 입력하세요 — 3촌(예: 삼촌)이 있으면 4촌(예: 사촌)은 비워 두세요 (제1000조②). 입력한 방계는 균분 처리됩니다. 대습상속 대상 아님."
                  heirs={state.collateralFourth}
                  onChange={(heirs) => update({ collateralFourth: heirs })}
                  allowRepresentation={false}
                  defaultLabel="방계혈족"
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

        {error ? (
          <div
            className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
            role="alert"
          >
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

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
                resultReady={result !== null}
                onClick={handleExportPdf}
              />
              <ActionButton
                action="csv"
                icon={FileSpreadsheet}
                label="CSV"
                loadingAction={loadingAction}
                requiresResult
                resultReady={result !== null}
                onClick={handleExportCsv}
              />
              <ActionButton
                action="copy"
                icon={Clipboard}
                label="복사"
                loadingAction={loadingAction}
                requiresResult
                resultReady={result !== null}
                onClick={handleCopy}
              />
              <ActionButton
                action="save"
                icon={FileJson}
                label=".lcalc 저장"
                loadingAction={loadingAction}
                requiresResult
                resultReady={result !== null}
                onClick={handleSaveLcalc}
              />
              <ActionButton
                action="load"
                icon={FileJson}
                label=".lcalc 열기"
                loadingAction={loadingAction}
                requiresResult={false}
                resultReady={result !== null}
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
            <span className="text-muted-foreground">위자료</span>
            <span className="text-right">{formatWon(result.solatiumWon)}</span>
            <span className="text-muted-foreground">장례비</span>
            <span className="text-right">{formatWon(result.funeralExpenseWon)}</span>
            <span className="text-muted-foreground">과실상계 대상 소계</span>
            <span className="text-right">{formatWon(result.pecuniaryDamagesSubtotalWon)}</span>
            <span className="text-muted-foreground">
              과실상계 ({formatRatioPercent(result.faultOffset.ratio)})
            </span>
            <span className="text-right">{formatWon(result.faultOffset.afterWon)}</span>
            <span className="text-muted-foreground">비율공제 소계</span>
            <span className="text-right">{formatWon(result.deductions.ratioSubtotalWon)}</span>
            <span className="text-muted-foreground">전액공제 소계</span>
            <span className="text-right">{formatWon(result.deductions.absoluteSubtotalWon)}</span>
            {result.deductions.industrialBenefitWon !== undefined ? (
              <>
                <span className="text-muted-foreground">산재보험급여 공제 (유족급여)</span>
                <span className="text-right" data-testid="compensation-death-industrial-benefit">
                  {formatWon(result.deductions.industrialBenefitWon)}
                </span>
              </>
            ) : null}
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
              호프만 240 한도 적용 — {result.hoffman240Cap.cappedAtIndex + 1}번째 구간부터 누적치가
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
                    <td className="py-2 text-right">{formatWon(share.amountWon)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        {stale.message ? ` — ${stale.message}` : ""}
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
    </>
  );
}

function ResultCards({ result }: { result: CompensationResult }) {
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
            <span className="text-muted-foreground">일실수입 소계</span>
            <span className="text-right">{formatWon(result.lostIncomeSubtotalWon)}</span>
            <span className="text-muted-foreground">위자료</span>
            <span className="text-right">{formatWon(result.solatiumWon)}</span>
            <span className="text-muted-foreground">과실상계 대상 소계</span>
            <span className="text-right">{formatWon(result.pecuniaryDamagesSubtotalWon)}</span>
            <span className="text-muted-foreground">
              과실상계 ({formatRatioPercent(result.faultOffset.ratio)})
            </span>
            <span className="text-right">{formatWon(result.faultOffset.afterWon)}</span>
            <span className="text-muted-foreground">비율공제 소계</span>
            <span className="text-right">{formatWon(result.deductions.ratioSubtotalWon)}</span>
            <span className="text-muted-foreground">전액공제 소계</span>
            <span className="text-right">{formatWon(result.deductions.absoluteSubtotalWon)}</span>
            {result.deductions.industrialBenefitWon !== undefined ? (
              <>
                <span className="text-muted-foreground">산재보험급여 공제 (장해급여)</span>
                <span className="text-right" data-testid="compensation-industrial-benefit">
                  {formatWon(result.deductions.industrialBenefitWon)}
                </span>
              </>
            ) : null}
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
              호프만 240 한도 적용 — {result.hoffman240Cap.cappedAtIndex + 1}번째 구간부터 누적치가
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
