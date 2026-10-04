import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  FileJson,
  Loader2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  STANDARD_DISCLAIMER,
  computeDateSpan,
  computePeriod,
  createHolidayDeps,
  holidaysVersionTag,
  loadHolidays,
  type HolidayExtensionStatus,
  type PeriodUnit,
} from "@lawcalc-kr/core-engine";
import { computeStaleBadge, type StaleBadgeResult } from "@lawcalc-kr/datasets-compensation";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { FormulaCell } from "../components/result/FormulaCell";
import { ResultFreshnessNotice } from "../components/result/ResultFreshnessNotice";
import { useFormShortcuts } from "../hooks/use-form-shortcuts";
import { useResultFingerprint } from "../hooks/use-result-fingerprint";
import { useCaseSlot } from "../lib/case-file";
import { parseWonText } from "../lib/format-won";
import {
  ipc,
  type LcalcFile,
  type LcalcPeriodPayload,
  type LcalcPeriodResult,
  type PeriodMode,
  type PeriodTabInput,
} from "../lib/ipc";
import { createLcalcDirtySnapshot, useLcalcDirtyTracker } from "../lib/lcalc-dirty-state";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "../lib/lcalc-migrations";
import { parseLoadedPeriodLcalcInput, validateLcalcEnvelope } from "../lib/lcalc-validation";
import { todayIso } from "../lib/today";

const APP_VERSION = __APP_VERSION__;

/** 공휴일 dataset 은 앱 기동 시 한 번만 읽는다. 제161조 판정의 단일 출처. */
const HOLIDAY_DATASET = loadHolidays();
const HOLIDAYS_VERSION_TAG = holidaysVersionTag(HOLIDAY_DATASET);
const HOLIDAY_COVERAGE = HOLIDAY_DATASET.coverage;
const holidayDeps = createHolidayDeps(HOLIDAY_DATASET);

type ActionName = "copy" | "save" | "load";

interface ToastState {
  type: "success" | "error";
  message: string;
}

export interface PeriodFormState {
  mode: PeriodMode;
  /** 기간의 기초가 되는 날. 두 산식이 공유한다. */
  from: string;
  unit: PeriodUnit;
  countText: string;
  includeFirstDay: boolean;
  holidayExtension: boolean;
  /** 일수 산식의 종료일. */
  to: string;
}

const UNIT_OPTIONS: ReadonlyArray<{ value: PeriodUnit; label: string }> = [
  { value: "day", label: "일" },
  { value: "week", label: "주" },
  { value: "month", label: "개월" },
  { value: "year", label: "년" },
];

export function emptyPeriodForm(): PeriodFormState {
  const today = todayIso();
  return {
    mode: "expiry",
    from: today,
    unit: "day",
    countText: "14",
    includeFirstDay: false,
    holidayExtension: true,
    to: today,
  };
}

export function buildPeriodTabInput(form: PeriodFormState): PeriodTabInput {
  return {
    mode: form.mode,
    period: {
      from: form.from,
      unit: form.unit,
      // 수량은 원 단위 입력과 같은 정수 파서를 쓴다 (소수점 이하 절사, 비-숫자 제거).
      count: Number(parseWonText(form.countText) || "0"),
      includeFirstDay: form.includeFirstDay,
      holidayExtension: form.holidayExtension,
    },
    span: {
      from: form.from,
      to: form.to,
      includeFirstDay: form.includeFirstDay,
    },
  };
}

export function applyLoadedPeriodInput(input: PeriodTabInput): PeriodFormState {
  return {
    mode: input.mode,
    from: input.period.from,
    unit: input.period.unit,
    countText: String(input.period.count),
    includeFirstDay: input.period.includeFirstDay ?? false,
    holidayExtension: input.period.holidayExtension ?? false,
    to: input.span.to,
  };
}

/**
 * 두 산식을 하나의 결과 타입으로 낸다. `mode` 가 discriminator 이고 나머지는 엔진 결과
 * 그대로다. 화면 상태와 `.lcalc` payload 가 같은 타입을 쓰므로 저장·복원 사이에서
 * 필드가 새지 않는다.
 */
export function computePeriodOutcome(
  input: PeriodTabInput,
  computedAt = new Date().toISOString(),
): LcalcPeriodResult {
  const meta = {
    dataVersion: HOLIDAYS_VERSION_TAG,
    computedAt,
    disclaimer: STANDARD_DISCLAIMER,
  };
  if (input.mode === "span") {
    return { mode: "span", ...computeDateSpan(input.span), ...meta };
  }
  return { mode: "expiry", ...computePeriod(input.period, holidayDeps), ...meta };
}

const EXTENSION_LABEL: Record<HolidayExtensionStatus, string> = {
  off: "적용하지 않음 (옵션 꺼짐)",
  notApplied: "연장 없음 (말일이 근무일)",
  applied: "익일로 연장",
  // 엔진은 데이터 범위 밖뿐 아니라 토요일 말일 연장 시행일(2008-03-22) 전 토요일도 판정하지 않는다.
  outOfCoverage: "판정하지 못했습니다 (공휴일 데이터 커버리지 밖 또는 2008-03-22 이전 토요일)",
};

export function formatPeriodForClipboard(result: LcalcPeriodResult): string {
  const lines = ["LawCalc Korea 기간 계산 결과"];
  if (result.mode === "expiry") {
    lines.push(
      `기산일: ${result.startDate}`,
      `만료일: ${result.expiryDate}`,
      `제161조 조정 전 만료일: ${result.rawExpiry}`,
      `제161조 (토요일·공휴일): ${EXTENSION_LABEL[result.holidayExtension]}`,
    );
    if (result.adjustmentReasonKo) lines.push(`조정 사유: ${result.adjustmentReasonKo}`);
    lines.push(`공휴일 데이터 버전: ${result.dataVersion}`);
  } else {
    lines.push(
      `기산일: ${result.startDate}`,
      `기간: ${result.days}일`,
      `역법 환산 (참고): ${result.calendar.years}년 ${result.calendar.months}개월 ${result.calendar.days}일`,
    );
  }
  lines.push(
    `적용 조문: ${result.articles.join(", ")}`,
    `산출 근거: ${result.formulaText}`,
    `계산 시각: ${result.computedAt}`,
    "",
    result.noteKo,
    "",
    STANDARD_DISCLAIMER,
  );
  return lines.join("\n");
}

export function buildPeriodLcalcFile(
  input: PeriodTabInput,
  result: LcalcPeriodResult,
  note: string,
): LcalcFile {
  const payload: LcalcPeriodPayload = {
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    input,
    result: { ...result, disclaimer: STANDARD_DISCLAIMER },
    disclaimer: STANDARD_DISCLAIMER,
  };
  if (note.trim()) payload.note = note.trim();
  return {
    schemaVersion: CURRENT_LCALC_SCHEMA_VERSION,
    kind: "period",
    envelopeFeatures: ["period@1"],
    dataVersions: { holidays: HOLIDAYS_VERSION_TAG },
    payload,
  };
}

function formatComputedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function buildPeriodDirtySnapshot(form: PeriodFormState, note: string) {
  return createLcalcDirtySnapshot({ form, note });
}

export function PeriodCalculator({ active = true }: { active?: boolean }) {
  const [form, setForm] = useState<PeriodFormState>(emptyPeriodForm);
  const [note, setNote] = useState("");
  const [loadingAction, setLoadingAction] = useState<ActionName | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const input = useMemo(() => buildPeriodTabInput(form), [form]);
  const stale = useMemo<StaleBadgeResult>(
    () => computeStaleBadge(HOLIDAY_DATASET.snapshotDate, todayIso()),
    [],
  );

  const dirtySnapshot = useMemo(() => buildPeriodDirtySnapshot(form, note), [form, note]);
  const markPeriodClean = useLcalcDirtyTracker("period", dirtySnapshot);
  const pristineSnapshotRef = useRef(dirtySnapshot);
  const resultFingerprint = buildPeriodDirtySnapshot(form, "");
  const {
    value: result,
    setValue: setResult,
    setLoaded: setLoadedResult,
    stale: resultStale,
    notice: resultNotice,
  } = useResultFingerprint<LcalcPeriodResult>(resultFingerprint);
  const {
    value: error,
    setValue: setError,
    stale: errorStale,
  } = useResultFingerprint<string>(resultFingerprint);
  const resultReady = result !== null && !resultStale;

  const update = (patch: Partial<PeriodFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleCalculate = () => {
    try {
      setResult(computePeriodOutcome(input));
      setError(null);
      setToast(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReset = () => {
    setForm(emptyPeriodForm());
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
      await ipc.copyToClipboard(formatPeriodForClipboard(result));
      return "기간 계산 결과를 클립보드에 복사했습니다.";
    });

  const handleSaveLcalc = () =>
    runAction("save", async () => {
      if (!result || resultStale) throw new Error("계산 후 .lcalc 파일을 저장해 주세요.");
      const path = await ipc.saveLcalc(buildPeriodLcalcFile(input, result, note));
      if (path) {
        markPeriodClean();
      }
      return path ? `.lcalc 파일을 저장했습니다: ${path}` : "저장을 취소했습니다.";
    });

  const applyLoadedFile = (file: unknown) => {
    const migratedFile = migrateLcalcFile(file);
    validateLcalcEnvelope(migratedFile);
    const loaded = parseLoadedPeriodLcalcInput(migratedFile);
    const applied = applyLoadedPeriodInput(loaded.input);
    const loadedNote = loaded.note ?? "";
    setForm(applied);
    setNote(loadedNote);
    const differs = setLoadedResult(
      loaded.result,
      () => computePeriodOutcome(loaded.input),
      (r) => (r.mode === "expiry" ? r.expiryDate : `${r.days}일`),
    );
    setError(null);
    markPeriodClean(buildPeriodDirtySnapshot(applied, loadedNote));
    return differs;
  };

  useCaseSlot("period", {
    collect: () => {
      if (dirtySnapshot === pristineSnapshotRef.current) {
        return { status: "pristine" };
      }
      try {
        return {
          status: "ok",
          file: buildPeriodLcalcFile(input, computePeriodOutcome(input), note),
        };
      } catch {
        return { status: "invalid" };
      }
    },
    apply: applyLoadedFile,
    markSaved: () => markPeriodClean(),
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

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[580px_minmax(0,1fr)]">
      <div className="grid gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">기간 입력</CardTitle>
            <p className="text-xs text-muted-foreground">
              민법 제157조 (초일 불산입) / 제159조 (말일의 종료) / 제160조 (역법적 계산) / 제161조
              (공휴일 등과 기간의 만료) 적용.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <label className="grid gap-2 text-sm font-medium">
              계산 방식
              <Select
                value={form.mode}
                onChange={(e) => update({ mode: e.target.value as PeriodMode })}
              >
                <option value="expiry">기간의 만료일 (기산일 + 기간)</option>
                <option value="span">두 날짜 사이의 기간 (일수)</option>
              </Select>
            </label>

            <label className="grid gap-2 text-sm font-medium">
              기산의 기초가 되는 날
              <Input
                type="date"
                value={form.from}
                onChange={(e) => update({ from: e.target.value })}
              />
              <span className="text-xs font-normal text-muted-foreground">
                계약일·송달일 등 기간의 기초가 되는 날입니다. 이 날 자체를 세는지 여부는 아래
                옵션에서 정합니다.
              </span>
            </label>

            {form.mode === "expiry" ? (
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <label className="grid gap-2 text-sm font-medium">
                  기간
                  <Input
                    inputMode="numeric"
                    aria-label="기간 수량"
                    placeholder="예: 14"
                    value={form.countText}
                    onChange={(e) => update({ countText: parseWonText(e.target.value) })}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  단위
                  <Select
                    value={form.unit}
                    onChange={(e) => update({ unit: e.target.value as PeriodUnit })}
                  >
                    {UNIT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            ) : (
              <label className="grid gap-2 text-sm font-medium">
                종료일
                <Input
                  type="date"
                  value={form.to}
                  onChange={(e) => update({ to: e.target.value })}
                />
              </label>
            )}

            <div className="grid gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includeFirstDay}
                  onChange={(e) => update({ includeFirstDay: e.target.checked })}
                />
                초일 산입 (제157조 단서, 오전 0시부터 시작하는 기간)
              </label>
              {form.mode === "expiry" ? (
                <>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.holidayExtension}
                      onChange={(e) => update({ holidayExtension: e.target.checked })}
                    />
                    말일이 토요일·공휴일이면 익일로 만료 (제161조)
                  </label>
                  <p className="text-xs text-muted-foreground">
                    공휴일 데이터 커버리지: {HOLIDAY_COVERAGE.from} ~ {HOLIDAY_COVERAGE.to}.
                    만료일이 이 범위 밖이면 만료일 자체는 계산하되 토요일·공휴일 연장 여부는
                    판정하지 않고 그 사실을 결과에 표시합니다.
                  </p>
                </>
              ) : null}
            </div>

            <label className="grid gap-2 text-sm font-medium">
              비고
              <textarea
                aria-label="기간 계산 비고"
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
        <HolidayDatasetBadge stale={stale} />

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
          <>
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">계산 결과</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 pt-0">
                {result.mode === "expiry" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span className="text-muted-foreground">기산일 (제157조)</span>
                      <span className="text-right">{result.startDate}</span>
                      <span className="text-muted-foreground">만료일</span>
                      <span
                        className="text-right text-base font-semibold"
                        data-testid="period-expiry-date"
                      >
                        {result.expiryDate}
                      </span>
                      <span className="text-muted-foreground">제161조 조정 전 만료일</span>
                      <span className="text-right" data-testid="period-raw-expiry-date">
                        {result.rawExpiry}
                      </span>
                      <span className="text-muted-foreground">제161조 (토요일·공휴일)</span>
                      <span className="text-right" data-testid="period-extension-status">
                        {EXTENSION_LABEL[result.holidayExtension]}
                      </span>
                    </div>
                    {result.adjustmentReasonKo ? (
                      <div
                        className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                          result.holidayExtension === "outOfCoverage"
                            ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                            : "border-border bg-muted/40 text-foreground"
                        }`}
                        role="status"
                        data-testid="period-adjustment-reason"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{result.adjustmentReasonKo}</span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">기산일 (제157조)</span>
                    <span className="text-right">{result.startDate}</span>
                    <span className="text-muted-foreground">기간</span>
                    <span className="text-right text-base font-semibold">{result.days}일</span>
                    <span className="text-muted-foreground">역법 환산 (참고)</span>
                    <span className="text-right">
                      {result.calendar.years}년 {result.calendar.months}개월 {result.calendar.days}
                      일
                    </span>
                  </div>
                )}

                <div className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">산출 근거</span>
                  <FormulaCell formula={result.formulaText} />
                </div>

                <div className="grid gap-1 text-xs text-muted-foreground">
                  <span>적용 조문: {result.articles.join(", ")}</span>
                  <span>{result.noteKo}</span>
                  {result.mode === "expiry" ? (
                    <span>공휴일 데이터 버전: {result.dataVersion}</span>
                  ) : null}
                  <span>계산 시각: {formatComputedAt(result.computedAt)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{result.disclaimer || STANDARD_DISCLAIMER}</span>
            </div>
          </>
        ) : null}

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">내보내기</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="flex flex-wrap gap-2">
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
                좌측에서 기산의 기초가 되는 날과 기간을 입력한 후{" "}
                <span className="font-medium text-foreground">계산</span> 버튼을 누르세요.
              </p>
              <p className="text-xs">
                근거: 민법 제155조 (본장의 규정은 법령·재판상 처분 또는 법률행위에 다른 정함이 없는
                경우에 적용) / 제157조 / 제159조 / 제160조 / 제161조. 본 탭은 민법의 일반 기간
                계산입니다. 소송법상 불변기간(항소·상고기간 등)의 기산 특칙과 기간 말일 특례는 다음
                버전 범위입니다.
              </p>
              <p className="text-xs">공휴일 데이터 버전: {HOLIDAYS_VERSION_TAG}</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

/**
 * 공휴일 dataset 스냅샷 경과 배지. 다른 탭(손해배상)의 배지와 같은 자리·같은 모양이다.
 *
 * `computeStaleBadge` 의 `message` 는 시중노임 dataset 전용 문구라 여기서는 쓰지 않고
 * 공휴일 dataset 문구를 따로 낸다. 임계(6개월·12개월)와 색은 그대로 공유한다.
 */
function HolidayDatasetBadge({ stale }: { stale: StaleBadgeResult }) {
  const palette =
    stale.level === "red"
      ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
      : stale.level === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200";
  const Icon = stale.level === "neutral" ? CheckCircle2 : AlertTriangle;
  const message =
    stale.level === "neutral"
      ? ""
      : " (공휴일 데이터셋 갱신 여부를 확인하고, 만료일이 토요일·공휴일인지 직접 확인해 주세요.)";
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${palette}`}
      role="status"
      data-testid="period-stale-badge"
      data-stale-level={stale.level}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        공휴일 데이터셋 {HOLIDAYS_VERSION_TAG} · 기준일 {HOLIDAY_DATASET.snapshotDate} · 커버리지{" "}
        {HOLIDAY_COVERAGE.from} ~ {HOLIDAY_COVERAGE.to} · 경과 {stale.monthsElapsed}개월
        {message}
      </span>
    </div>
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
