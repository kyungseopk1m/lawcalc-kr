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
import { useMemo, useState } from "react";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";
import {
  computeCompensation,
  type CompensationAbsoluteDeduction,
  type CompensationInput,
  type CompensationRatioDeduction,
  type CompensationResult,
  type CompensationSegment,
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

import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { useFormShortcuts } from "../hooks/use-form-shortcuts";
import { formatWonInput, parseWonAmount, parseWonText } from "../lib/format-won";
import { ipc, type LcalcCompensationPayload, type LcalcFile } from "../lib/ipc";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "../lib/lcalc-migrations";
import { parseLoadedCompensationLcalcInput, validateLcalcEnvelope } from "../lib/lcalc-validation";

const APP_VERSION = __APP_VERSION__;

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

  return input;
}

export function applyLoadedCompensationInput(input: CompensationInput): CompensationFormState {
  return {
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
  };
}

function formatWon(value: number): string {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}원`;
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

  return [
    "LawCalc Korea 자동차 사고 부상 손해배상 계산 결과",
    `중복장해율: ${formatRatioPercent(result.combinedLossRate)}`,
    `일실수입 소계: ${formatWon(result.lostIncomeSubtotalWon)}`,
    `위자료: ${formatWon(result.solatiumWon)}`,
    `재산상 손해 소계: ${formatWon(result.pecuniaryDamagesSubtotalWon)}`,
    `과실상계 (${formatRatioPercent(result.faultOffset.ratio)} 후): ${formatWon(result.faultOffset.afterWon)}`,
    `비율공제 소계: ${formatWon(result.deductions.ratioSubtotalWon)}`,
    `전액공제 소계: ${formatWon(result.deductions.absoluteSubtotalWon)}`,
    `최종 합계: ${formatWon(result.finalWon)}`,
    `데이터 버전: laborRates=${result.dataVersions.laborRates} / lifeExpectancy=${result.dataVersions.lifeExpectancy} / hoffman=${result.dataVersions.hoffman} / leibniz=${result.dataVersions.leibniz}`,
    `계산 시각: ${result.computedAt}`,
    "",
    "구간\t기간\t상실률\t단가\t호프만(적용)\t금액",
    segmentRows,
    "",
    STANDARD_DISCLAIMER,
  ].join("\n");
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
    envelopeFeatures: ["compensation@1"],
    dataVersions: {
      laborRates: result.dataVersions.laborRates,
      lifeExpectancy: result.dataVersions.lifeExpectancy,
      hoffman: result.dataVersions.hoffman,
      leibniz: result.dataVersions.leibniz,
    },
    payload,
  };
}

export function CompensationCalculator() {
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
      return path ? `.lcalc 파일을 저장했습니다: ${path}` : "저장을 취소했습니다.";
    });

  const handleLoadLcalc = () =>
    runAction("load", async () => {
      const file = await ipc.loadLcalc();
      if (!file) return "불러오기를 취소했습니다.";
      const migratedFile = migrateLcalcFile(file);
      validateLcalcEnvelope(migratedFile);
      const loaded = parseLoadedCompensationLcalcInput(migratedFile);
      setState(applyLoadedCompensationInput(loaded.input));
      setNote(loaded.note ?? "");
      setResult(loaded.result ?? computeCompensation(loaded.input));
      setError(null);
      return ".lcalc 파일을 불러왔습니다.";
    });

  useFormShortcuts({
    onSave: () => {
      void handleSaveLcalc();
    },
    onCalculate: handleCalculate,
    onReset: handleReset,
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
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[580px_minmax(0,1fr)]">
      <div className="grid gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Scale className="h-4 w-4" aria-hidden="true" />
              기초사항
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              민법 제393조·396조·763조 / 대법원 2018다248909 (가동연한 65세).
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
            <CardTitle className="text-sm">노동력상실률</CardTitle>
            <p className="text-xs text-muted-foreground">
              영구장해 중복은 자동 합산 (1 − Π(1 − rᵢ)), 한시장해는 (년수/10)·rᵢ 영구 환산.
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

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">위자료 · 과실 · 공제</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <div className="grid gap-3 sm:grid-cols-2">
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
                좌측에서 기초사항, 노동력상실률, 일실수입을 입력한 후{" "}
                <span className="font-medium text-foreground">계산</span> 버튼을 누르세요.
              </p>
              <p className="text-xs">
                v0.5.0은 자동차 사고 부상만 지원합니다. 자×사망, 산재, 기타손해(개호비 등)는 후속
                버전에서 다룹니다.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
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

function ResultCards({ result }: { result: CompensationResult }) {
  return (
    <>
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">계산 결과</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">중복 노동력상실률</span>
            <span className="text-right">{formatRatioPercent(result.combinedLossRate)}</span>
            <span className="text-muted-foreground">일실수입 소계</span>
            <span className="text-right">{formatWon(result.lostIncomeSubtotalWon)}</span>
            <span className="text-muted-foreground">위자료</span>
            <span className="text-right">{formatWon(result.solatiumWon)}</span>
            <span className="text-muted-foreground">재산상 손해 소계</span>
            <span className="text-right">{formatWon(result.pecuniaryDamagesSubtotalWon)}</span>
            <span className="text-muted-foreground">
              과실상계 ({formatRatioPercent(result.faultOffset.ratio)})
            </span>
            <span className="text-right">{formatWon(result.faultOffset.afterWon)}</span>
            <span className="text-muted-foreground">비율공제 소계</span>
            <span className="text-right">{formatWon(result.deductions.ratioSubtotalWon)}</span>
            <span className="text-muted-foreground">전액공제 소계</span>
            <span className="text-right">{formatWon(result.deductions.absoluteSubtotalWon)}</span>
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
