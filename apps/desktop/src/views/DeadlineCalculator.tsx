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
  computeDeadline,
  createHolidayDeps,
  deadlinesVersionTag,
  holidaysVersionTag,
  listDeadlines,
  loadDeadlines,
  loadHolidays,
  type DeadlineImmutable,
  type DeadlineInput,
  type DeadlineItem,
  type HolidayExtensionStatus,
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
import {
  ipc,
  type LcalcDeadlinePayload,
  type LcalcDeadlineResult,
  type LcalcFile,
} from "../lib/ipc";
import { createLcalcDirtySnapshot, useLcalcDirtyTracker } from "../lib/lcalc-dirty-state";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "../lib/lcalc-migrations";
import { parseLoadedDeadlineLcalcInput, validateLcalcEnvelope } from "../lib/lcalc-validation";
import { todayIso } from "../lib/today";

const APP_VERSION = __APP_VERSION__;

/** 두 데이터셋을 앱 기동 시 한 번만 읽는다. 만료일이 둘 다에 걸린다. */
const DEADLINE_DATASET = loadDeadlines();
const DEADLINES_VERSION_TAG = deadlinesVersionTag(DEADLINE_DATASET);
const DEADLINE_ITEMS = listDeadlines(DEADLINE_DATASET);
const DEADLINE_BY_ID = new Map(DEADLINE_ITEMS.map((item) => [item.id, item]));

const HOLIDAY_DATASET = loadHolidays();
const HOLIDAYS_VERSION_TAG = holidaysVersionTag(HOLIDAY_DATASET);
const HOLIDAY_COVERAGE = HOLIDAY_DATASET.coverage;
const holidayDeps = createHolidayDeps(HOLIDAY_DATASET);

/**
 * 계열별 묶음. 35건은 한 줄짜리 목록으로 고르기에 너무 길다. 데이터셋 순서가 이미
 * 계열별로 묶여 있으므로 그 순서를 그대로 optgroup 으로 접는다.
 */
const DEADLINE_GROUPS: ReadonlyArray<{ groupKo: string; items: DeadlineItem[] }> =
  DEADLINE_ITEMS.reduce<{ groupKo: string; items: DeadlineItem[] }[]>((groups, item) => {
    const last = groups.at(-1);
    if (last?.groupKo === item.groupKo) {
      last.items.push(item);
    } else {
      groups.push({ groupKo: item.groupKo, items: [item] });
    }
    return groups;
  }, []);

type ActionName = "copy" | "save" | "load";

interface ToastState {
  type: "success" | "error";
  message: string;
}

export interface DeadlineFormState {
  id: string;
  /** 항목의 `startEventKo` 가 정한 날. 계열마다 송달일·고지일·선고일로 다르다. */
  startEventDate: string;
  useAlternate: boolean;
}

export function emptyDeadlineForm(): DeadlineFormState {
  return {
    id: DEADLINE_ITEMS[0]?.id ?? "",
    startEventDate: todayIso(),
    useAlternate: false,
  };
}

/**
 * 화면 상태 → 엔진 입력.
 *
 * `useAlternate` 는 대체 기간이 있는 항목에서만 싣는다. 대체 기간을 켠 채로 다른 항목을
 * 고르면 엔진이 RangeError 를 던지는데, 그건 사용자의 입력 오류가 아니라 화면이 남긴
 * 찌꺼기다.
 */
export function buildDeadlineTabInput(form: DeadlineFormState): DeadlineInput {
  const item = DEADLINE_BY_ID.get(form.id);
  return {
    id: form.id,
    startEventDate: form.startEventDate,
    ...(form.useAlternate && item?.alternate !== undefined ? { useAlternate: true } : {}),
  };
}

export function applyLoadedDeadlineInput(input: DeadlineInput): DeadlineFormState {
  return {
    id: input.id,
    startEventDate: input.startEventDate,
    useAlternate: input.useAlternate ?? false,
  };
}

export function computeDeadlineOutcome(
  input: DeadlineInput,
  computedAt = new Date().toISOString(),
): LcalcDeadlineResult {
  return {
    ...computeDeadline(input, holidayDeps, DEADLINE_DATASET),
    holidaysVersion: HOLIDAYS_VERSION_TAG,
    computedAt,
    disclaimer: STANDARD_DISCLAIMER,
  };
}

const UNIT_LABEL: Record<DeadlineItem["unit"], string> = {
  day: "일",
  week: "주",
  month: "개월",
  year: "년",
};

const JUST_CAUSE_WARNING =
  "이 기한에는 정당한 사유가 있으면 기간이 지나도 할 수 있다는 단서가 붙어 있습니다. 만료일을 절차가 봉쇄되는 날로 단정하지 마십시오.";

const ROLLOVER_LABEL: Record<HolidayExtensionStatus, string> = {
  off: "판정하지 않음",
  notApplied: "조정 없음 (말일이 근무일)",
  applied: "익일 근무일로 연장",
  // 엔진은 데이터 범위 밖뿐 아니라 토요일 말일 연장 시행일(2008-03-22) 전 토요일도 판정하지 않는다.
  outOfCoverage: "판정하지 못했습니다 (공휴일 데이터 커버리지 밖 또는 2008-03-22 이전 토요일)",
};

/**
 * 불변기간 3값의 안내 문구.
 *
 * `unstated` 를 "불변기간 아님"으로 읽히게 쓰면 안 된다. 가사 계열 3건은 법령에 표시가
 * 없어 판정하지 않은 것이지, 불변기간이 아니라고 확인된 것이 아니다.
 * `no` 문구가 민사소송법 제173조를 말하지 않는 것도 같은 이유다. 형사 계열은 추후보완이
 * 아니라 상소권회복 제도를 쓴다.
 */
const IMMUTABLE_NOTICE: Record<DeadlineImmutable, string> = {
  yes: "불변기간이므로 법원이 이 기간을 늘이거나 줄일 수 없습니다. 다만 당사자가 책임질 수 없는 사유로 지키지 못한 때에는 민사소송법 제173조의 추후보완이 가능합니다.",
  no: "근거 조문이 이 기간을 불변기간으로 정하지 않았습니다. 기간의 신축과 지키지 못한 경우의 구제 수단은 절차법마다 다르므로 근거 조문을 확인해 주세요.",
  unstated:
    "법령에 불변기간 표시가 없어 조문만으로는 판정하지 않았습니다. 불변기간이 아니라고 확인된 것이 아니므로 어느 쪽으로도 단정하지 마십시오.",
};

/**
 * "정당한 사유" 단서가 붙은 기한인지.
 *
 * 조문이 "다만, 정당한 사유가 있는 때에는 그러하지 아니하다"로 끝나면 기간이 지나도
 * 절차가 봉쇄되지 않는다. 만료일을 단정적으로 보여주면 안 되는 항목이다. 현재 데이터셋에서는
 * 취소소송 1년(행정소송법 제20조 제2항)과 행정심판 180일(행정심판법 제27조 제3항) 두 건이다.
 * id 를 박지 않고 원문에서 읽는 이유는 데이터셋에 같은 단서의 항목이 늘어도 경고가 따라오게
 * 하기 위해서다.
 */
export function hasJustCauseCaveat(result: LcalcDeadlineResult): boolean {
  return `${result.sourceQuote}${result.noteKo ?? ""}`.includes("정당한 사유");
}

export function formatDeadlineForClipboard(result: LcalcDeadlineResult): string {
  const lines = [
    "LawCalc Korea 불변기한 계산 결과",
    `기한: ${result.groupKo} ${result.labelKo}`,
    `기산 사건일: ${result.startEventKo} ${result.startEventDate}`,
    `적용 기간: ${result.lengthTextKo}${
      result.appliedAlternateKo === undefined ? "" : ` (${result.appliedAlternateKo})`
    }`,
    `만료일: ${result.expiryDate}`,
    `말일 조정 전 만료일: ${result.period.rawExpiry}`,
    `말일 조정: ${ROLLOVER_LABEL[result.holidayRollover.status]}`,
    `말일 조정 근거: ${result.holidayRollover.reasonKo}`,
    `불변기간: ${result.immutableLabelKo} (근거: ${result.immutableSourceArticle})`,
    IMMUTABLE_NOTICE[result.immutable],
  ];
  if (hasJustCauseCaveat(result)) {
    lines.push(JUST_CAUSE_WARNING);
  }
  lines.push(
    `근거 법령: ${result.lawNameKo}`,
    `근거 조문: ${result.sourceArticle}`,
    `조문 원문: ${result.sourceQuote}`,
    `초일 규칙: ${result.periodRuleKo.firstDay}`,
    `말일 규칙: ${result.periodRuleKo.endOfPeriod}`,
    `산출 근거: ${result.formulaText}`,
  );
  if (result.noteKo !== undefined) {
    lines.push(`함정 메모: ${result.noteKo}`);
  }
  lines.push(
    `법정기한 데이터 버전: ${result.dataVersion}`,
    `공휴일 데이터 버전: ${result.holidaysVersion}`,
    `계산 시각: ${result.computedAt}`,
    "",
    STANDARD_DISCLAIMER,
  );
  return lines.join("\n");
}

export function buildDeadlineLcalcFile(
  input: DeadlineInput,
  result: LcalcDeadlineResult,
  note: string,
): LcalcFile {
  const payload: LcalcDeadlinePayload = {
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    input,
    result: { ...result, disclaimer: STANDARD_DISCLAIMER },
    disclaimer: STANDARD_DISCLAIMER,
  };
  if (note.trim()) payload.note = note.trim();
  return {
    schemaVersion: CURRENT_LCALC_SCHEMA_VERSION,
    kind: "deadline",
    envelopeFeatures: ["deadline@1"],
    // 계산이 두 데이터셋에 의존한다. 기한 자체는 deadlines, 말일 조정은 holidays.
    dataVersions: { deadlines: DEADLINES_VERSION_TAG, holidays: HOLIDAYS_VERSION_TAG },
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

function buildDeadlineDirtySnapshot(form: DeadlineFormState, note: string) {
  return createLcalcDirtySnapshot({ form, note });
}

export function DeadlineCalculator({ active = true }: { active?: boolean }) {
  const [form, setForm] = useState<DeadlineFormState>(emptyDeadlineForm);
  const [note, setNote] = useState("");
  const [loadingAction, setLoadingAction] = useState<ActionName | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const input = useMemo(() => buildDeadlineTabInput(form), [form]);
  const selected = DEADLINE_BY_ID.get(form.id);
  const stale = useMemo<StaleBadgeResult>(
    () => computeStaleBadge(DEADLINE_DATASET.updatedAt, todayIso()),
    [],
  );

  const dirtySnapshot = useMemo(() => buildDeadlineDirtySnapshot(form, note), [form, note]);
  const markDeadlineClean = useLcalcDirtyTracker("deadline", dirtySnapshot);
  const pristineSnapshotRef = useRef(dirtySnapshot);
  const resultFingerprint = buildDeadlineDirtySnapshot(form, "");
  const {
    value: result,
    setValue: setResult,
    setLoaded: setLoadedResult,
    stale: resultStale,
    notice: resultNotice,
  } = useResultFingerprint<LcalcDeadlineResult>(resultFingerprint);
  const {
    value: error,
    setValue: setError,
    stale: errorStale,
  } = useResultFingerprint<string>(resultFingerprint);
  const resultReady = result !== null && !resultStale;

  const update = (patch: Partial<DeadlineFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleCalculate = () => {
    try {
      setResult(computeDeadlineOutcome(input));
      setError(null);
      setToast(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReset = () => {
    setForm(emptyDeadlineForm());
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
      await ipc.copyToClipboard(formatDeadlineForClipboard(result));
      return "불변기한 계산 결과를 클립보드에 복사했습니다.";
    });

  const handleSaveLcalc = () =>
    runAction("save", async () => {
      if (!result || resultStale) throw new Error("계산 후 .lcalc 파일을 저장해 주세요.");
      const path = await ipc.saveLcalc(buildDeadlineLcalcFile(input, result, note));
      if (path) {
        markDeadlineClean();
      }
      return path ? `.lcalc 파일을 저장했습니다: ${path}` : "저장을 취소했습니다.";
    });

  const applyLoadedFile = (file: unknown) => {
    const migratedFile = migrateLcalcFile(file);
    validateLcalcEnvelope(migratedFile);
    const loaded = parseLoadedDeadlineLcalcInput(migratedFile);
    const applied = applyLoadedDeadlineInput(loaded.input);
    const loadedNote = loaded.note ?? "";
    setForm(applied);
    setNote(loadedNote);
    const differs = setLoadedResult(
      loaded.result,
      () => computeDeadlineOutcome(loaded.input),
      (r) => r.expiryDate,
    );
    setError(null);
    markDeadlineClean(buildDeadlineDirtySnapshot(applied, loadedNote));
    return differs;
  };

  useCaseSlot("deadline", {
    collect: () => {
      if (dirtySnapshot === pristineSnapshotRef.current) {
        return { status: "pristine" };
      }
      try {
        return {
          status: "ok",
          file: buildDeadlineLcalcFile(input, computeDeadlineOutcome(input), note),
        };
      } catch {
        return { status: "invalid" };
      }
    },
    apply: applyLoadedFile,
    markSaved: () => markDeadlineClean(),
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
            <CardTitle className="text-sm">법정기한 입력</CardTitle>
            <p className="text-xs text-muted-foreground">
              법령 원문에서 기간 길이와 기산점을 모두 확인한 상소·이의신청 기간{" "}
              {DEADLINE_ITEMS.length}건. {DEADLINE_DATASET.coverageNote}
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <label className="grid gap-2 text-sm font-medium">
              기한 항목
              <Select value={form.id} onChange={(e) => update({ id: e.target.value })}>
                {DEADLINE_GROUPS.map((group) => (
                  <optgroup key={group.groupKo} label={group.groupKo}>
                    {group.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.labelKo}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </label>

            <label className="grid gap-2 text-sm font-medium">
              기산 사건일
              <Input
                type="date"
                value={form.startEventDate}
                onChange={(e) => update({ startEventDate: e.target.value })}
              />
              {/* 계열마다 기산점이 다르다. 민사 항소는 송달일, 민사 즉시항고는 고지일,
                  형사 상소는 선고 또는 고지일이다. 라벨이 "기산일" 한 마디면 사용자가
                  어느 날짜를 넣어야 하는지 알 수 없다.

                  계열도 함께 적는다. "항소" 는 민사와 가사에 같은 이름으로 있고 닫힌 select
                  에는 그 이름만 보이는데, 둘은 불변기간 표시가 다르다(민사 제396조 제2항은
                  불변기간, 가사는 법령에 표시 없음). 어느 쪽을 골랐는지 화면에서 확인할
                  방법이 없으면 잘못 고른 채로 계산해도 알 수 없다. */}
              <span
                className="text-xs font-normal text-muted-foreground"
                data-testid="deadline-start-event"
              >
                {selected === undefined
                  ? "항목을 선택해 주세요."
                  : `${selected.groupKo} ${selected.labelKo} · 조문상 기산 기준: ${selected.startEventKo}`}
              </span>
            </label>

            {selected?.alternate ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.useAlternate}
                  onChange={(e) => update({ useAlternate: e.target.checked })}
                />
                {selected.alternate.conditionKo} (이 경우 {selected.alternate.length}
                {UNIT_LABEL[selected.alternate.unit]})
              </label>
            ) : null}

            <label className="grid gap-2 text-sm font-medium">
              비고
              <textarea
                aria-label="불변기한 계산 비고"
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
        <DeadlineDatasetBadge stale={stale} />

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
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">기한 항목</span>
                  <span className="text-right">
                    {result.groupKo} {result.labelKo}
                  </span>
                  <span className="text-muted-foreground">기산 사건일</span>
                  <span className="text-right">{result.startEventDate}</span>
                  <span className="text-muted-foreground">기산일</span>
                  <span className="text-right">{result.period.startDate}</span>
                  <span className="text-muted-foreground">적용 기간</span>
                  <span className="text-right">
                    {result.lengthTextKo}
                    {result.appliedAlternateKo === undefined
                      ? ""
                      : ` (${result.appliedAlternateKo})`}
                  </span>
                  <span className="text-muted-foreground">만료일</span>
                  <span
                    className="text-right text-base font-semibold"
                    data-testid="deadline-expiry-date"
                  >
                    {result.expiryDate}
                  </span>
                  <span className="text-muted-foreground">말일 조정 전 만료일</span>
                  <span className="text-right" data-testid="deadline-raw-expiry-date">
                    {result.period.rawExpiry}
                  </span>
                  <span className="text-muted-foreground">말일 조정</span>
                  <span className="text-right" data-testid="deadline-rollover-status">
                    {ROLLOVER_LABEL[result.holidayRollover.status]}
                  </span>
                  <span className="text-muted-foreground">불변기간</span>
                  <span className="text-right" data-testid="deadline-immutable-label">
                    {result.immutableLabelKo}
                  </span>
                </div>

                {hasJustCauseCaveat(result) ? (
                  <div
                    className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                    role="status"
                    data-testid="deadline-just-cause-warning"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{JUST_CAUSE_WARNING}</span>
                  </div>
                ) : null}

                <div
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                    result.immutable === "unstated"
                      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                      : "border-border bg-muted/40 text-foreground"
                  }`}
                  role="status"
                  data-testid="deadline-immutable-notice"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {IMMUTABLE_NOTICE[result.immutable]} (불변기간 근거:{" "}
                    {result.immutableSourceArticle})
                  </span>
                </div>

                {result.holidayRollover.status === "outOfCoverage" ? (
                  <div
                    className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                    role="status"
                    data-testid="deadline-rollover-reason"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{result.holidayRollover.reasonKo}</span>
                  </div>
                ) : null}

                <div className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">산출 근거</span>
                  <FormulaCell formula={result.formulaText} />
                </div>

                <div className="grid gap-1 text-xs text-muted-foreground">
                  <span>법정기한 데이터 버전: {result.dataVersion}</span>
                  <span>공휴일 데이터 버전: {result.holidaysVersion}</span>
                  <span>계산 시각: {formatComputedAt(result.computedAt)}</span>
                </div>
              </CardContent>
            </Card>

            {/*
              근거는 전부 항목 데이터에서 온다. 엔진 결과 안쪽의 `period.articles` 와
              `period.formulaText` 는 민사·형사를 가리지 않고 민법 조문을 적으므로 여기에
              쓰지 않는다. 형사 항목의 근거는 형사소송법이어야 한다.
            */}
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">근거</CardTitle>
              </CardHeader>
              <CardContent
                className="grid gap-2 p-4 pt-0 text-sm"
                data-testid="deadline-legal-basis"
              >
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">근거 법령</span>
                  <span className="text-right">{result.lawNameKo}</span>
                  <span className="text-muted-foreground">근거 조문</span>
                  <span className="text-right" data-testid="deadline-source-article">
                    {result.sourceArticle}
                  </span>
                </div>
                <p className="rounded-md bg-muted/40 px-3 py-2 text-xs leading-5">
                  {result.sourceQuote}
                </p>
                <div className="grid gap-1 text-xs text-muted-foreground">
                  <span data-testid="deadline-first-day-rule">
                    초일: {result.periodRuleKo.firstDay}
                  </span>
                  <span data-testid="deadline-end-of-period-rule">
                    말일: {result.periodRuleKo.endOfPeriod}
                  </span>
                  <span data-testid="deadline-rollover-basis">
                    말일 조정 근거: {result.holidayRollover.basisKo}
                  </span>
                </div>
              </CardContent>
            </Card>

            {result.noteKo ? (
              <div
                className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-foreground"
                data-testid="deadline-note"
              >
                {result.noteKo}
              </div>
            ) : null}

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
                좌측에서 기한 항목과 기산 사건일을 고른 후{" "}
                <span className="font-medium text-foreground">계산</span> 버튼을 누르세요. 기산
                기준은 항목마다 다릅니다 (송달일·고지일·선고일).
              </p>
              <p className="text-xs">
                말일이 토요일·공휴일이면 민사 계열은 민법 제161조, 형사 계열은 형사소송법 제66조
                제3항에 따라 만료일을 조정합니다. 공휴일 데이터 커버리지({HOLIDAY_COVERAGE.from} ~{" "}
                {HOLIDAY_COVERAGE.to}) 밖의 만료일은 만료일 자체는 계산하되 조정 여부를 판정하지
                않고 그 사실을 결과에 표시합니다.
              </p>
              <p className="text-xs">
                법정기한 데이터 버전: {DEADLINES_VERSION_TAG} · 공휴일 데이터 버전:{" "}
                {HOLIDAYS_VERSION_TAG}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

/**
 * 법정기한 dataset 스냅샷 경과 배지. 기간 계산 탭·손해배상 탭의 배지와 같은 자리·같은 모양이다.
 *
 * 기준일은 법령 개정이 잦은 쪽인 법정기한 dataset 의 `updatedAt` 을 쓰고, 공휴일 dataset 은
 * 버전 태그와 커버리지만 함께 적는다.
 */
function DeadlineDatasetBadge({ stale }: { stale: StaleBadgeResult }) {
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
      : " (법령 개정 여부와 공휴일 데이터셋 갱신 여부를 확인하고, 만료일을 직접 확인해 주세요.)";
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${palette}`}
      role="status"
      data-testid="deadline-stale-badge"
      data-stale-level={stale.level}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        법정기한 데이터셋 {DEADLINES_VERSION_TAG} · 기준일 {DEADLINE_DATASET.updatedAt} · 경과{" "}
        {stale.monthsElapsed}개월 · 공휴일 데이터셋 {HOLIDAYS_VERSION_TAG} · 커버리지{" "}
        {HOLIDAY_COVERAGE.from} ~ {HOLIDAY_COVERAGE.to}
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
