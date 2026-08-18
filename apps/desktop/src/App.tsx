import {
  Calculator,
  CheckCircle2,
  Clipboard,
  FileDown,
  FileJson,
  FileSpreadsheet,
  FileText,
  FolderInput,
  FolderOutput,
  Loader2,
  TableProperties,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  STANDARD_DISCLAIMER,
  addDays,
  buildInterestClaimText,
  calculateInterest,
  loadLegalRates,
  rateHistoryFor,
  type CalcOptions,
  type ClaimTextEnding,
  type InterestInput,
  type InterestResult,
  type LegalRatePreset as LegalRatePresetValue,
  type RateSegment,
} from "@lawcalc-kr/core-engine";

import { formatWon } from "./lib/format-won";

import { Footer } from "./components/layout/Footer";
import { Header } from "./components/layout/Header";
import { DateRangeInput } from "./components/form/DateRangeInput";
import {
  LegalRatePreset,
  type LegalRatePresetOption,
  legalRateOptions,
} from "./components/form/LegalRatePreset";
import { OptionsPanel } from "./components/form/OptionsPanel";
import { PrincipalInput } from "./components/form/PrincipalInput";
import { RateSegmentInput } from "./components/form/RateSegmentInput";
import { LegalCitation } from "./components/result/LegalCitation";
import { SegmentTable } from "./components/result/SegmentTable";
import { SummaryCard } from "./components/result/SummaryCard";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { UpdateDialog } from "./components/UpdateDialog";
import { useFormShortcuts } from "./hooks/use-form-shortcuts";
import { useUpdater } from "./hooks/useUpdater";
import {
  ipc,
  type LcalcCaseCalculationKey,
  type LcalcFile,
  type LcalcInterestPayload,
} from "./lib/ipc";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "./lib/lcalc-migrations";
import {
  createLcalcDirtySnapshot,
  useHasUnsavedLcalcChanges,
  useLcalcDirtyTracker,
} from "./lib/lcalc-dirty-state";
import {
  parseLoadedCaseLcalcInput,
  parseLoadedLcalcInput,
  validateLcalcEnvelope,
} from "./lib/lcalc-validation";
import {
  CASE_CALCULATION_LABELS,
  applyCaseCalculations,
  buildCaseLcalcFile,
  collectCaseCalculations,
  markCaseCalculationsSaved,
  useCaseSlot,
} from "./lib/case-file";
import { AppropriationCalculator } from "./views/AppropriationCalculator";
import { CompensationCalculator } from "./views/CompensationCalculator";
import { InheritanceCalculator } from "./views/InheritanceCalculator";
import { LitigationCostCalculator } from "./views/LitigationCostCalculator";

const defaultOptions: CalcOptions = {
  mode: "period",
  leapYear: "fixed365",
  includeFirstDay: false,
  rounding: "floor",
};

const defaultInput: InterestInput = {
  principal: 10_000_000,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  legalRatePreset: "civil",
  options: defaultOptions,
  note: "",
};

const APP_VERSION = __APP_VERSION__;

type ActionName = "pdf" | "csv" | "copy" | "claim" | "save" | "load" | "caseSave" | "caseLoad";

type TabId = "interest" | "inheritance" | "litigationCost" | "appropriation" | "compensation";

/**
 * 상단 탭. 종전에는 `<Button>` 다섯 개라 스크린리더가 탭으로 인식하지 못했고, 활성 탭이
 * 배경색으로만 구분돼 색을 구분하기 어려운 사용자에게는 표시가 없었다.
 */
const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "interest", label: "이자 계산" },
  { id: "inheritance", label: "상속분 간이 계산" },
  { id: "litigationCost", label: "소송비용" },
  { id: "appropriation", label: "변제충당" },
  { id: "compensation", label: "손해배상" },
];

const TAB_BY_CALCULATION: Record<LcalcCaseCalculationKey, TabId> = {
  interest: "interest",
  inheritance: "inheritance",
  "litigation-cost": "litigationCost",
  appropriation: "appropriation",
  compensation: "compensation",
};

interface ToastState {
  type: "success" | "error";
  message: string;
}

function toLegalRatePreset(
  preset: LegalRatePresetOption,
  customRate: number,
): LegalRatePresetValue | undefined {
  if (preset !== "custom") {
    return preset;
  }

  return customRate > 0 ? { customRate } : undefined;
}

/**
 * 프리셋이 계산 기간 전체를 덮는지 미리 본다.
 *
 * 덮지 못하면 `resolveSegments` 가 함수명과 영어 지시문이 든 RangeError 를 던지고, 그 문구가
 * 결과 영역 빨간 박스에 그대로 노출된다 ("supply an explicit segment" 가 이 앱의 "이자율 구간
 * 직접 입력" 을 가리킨다는 걸 알아볼 방법이 없다). 계산 자체를 막고 한국어로 안내한다.
 *
 * 경계일은 하드코딩하지 않고 데이터셋에서 읽는다 — 데이터가 바뀌면 문구도 따라간다.
 */
export function validatePresetCoverage(
  input: Pick<InterestInput, "startDate" | "endDate"> & { segments?: RateSegment[] },
  preset: LegalRatePresetOption,
): string {
  if (preset === "custom") return "";
  if ((input.segments ?? []).length > 0) return "";
  if (!input.startDate || !input.endDate || input.endDate < input.startDate) return "";
  const history = rateHistoryFor(loadLegalRates(), preset);
  const earliest = history[0]?.from;
  if (earliest === undefined || input.startDate >= earliest) return "";
  const label = legalRateOptions[preset].label;
  return `${label} 이율은 ${earliest} 부터 적용됩니다. 그 이전 기간은 아래 "이자율 구간 직접 입력" 으로 지정해 주세요.`;
}

function validateInput(input: InterestInput, preset: LegalRatePresetOption, customRate: number) {
  const segmentError = validateSegments(input.startDate, input.endDate, input.segments ?? []);
  const presetError = validatePresetCoverage(input, preset);

  return {
    preset: presetError,
    principal: input.principal > 0 ? "" : "원금은 0보다 큰 정수여야 합니다.",
    dateRange:
      input.startDate.length > 0 && input.endDate.length > 0 && input.endDate >= input.startDate
        ? ""
        : "종료일은 시작일과 같거나 이후여야 합니다.",
    customRate: preset === "custom" && customRate <= 0 ? "직접 입력 이율은 0보다 커야 합니다." : "",
    segments: segmentError,
  };
}

function validateSegments(startDate: string, endDate: string, segments: RateSegment[]) {
  if (segments.length === 0) {
    return "";
  }

  if (segments.some((segment) => !segment.from || !segment.to || segment.rate <= 0)) {
    return "이자율 구간의 시작일, 종료일, 연이율을 모두 입력해 주세요.";
  }

  const sorted = [...segments].sort((left, right) => left.from.localeCompare(right.from));

  if (sorted[0]?.from !== startDate) {
    return "이자율 구간은 계산 시작일과 같은 날짜에서 시작해야 합니다.";
  }

  if (sorted[sorted.length - 1]?.to !== endDate) {
    return "이자율 구간은 계산 종료일까지 빠짐없이 덮어야 합니다.";
  }

  for (let index = 0; index < sorted.length; index += 1) {
    const segment = sorted[index];
    if (!segment) {
      continue;
    }

    if (segment.to < segment.from) {
      return "이자율 구간의 종료일은 시작일과 같거나 이후여야 합니다.";
    }

    const previous = sorted[index - 1];
    if (previous) {
      if (segment.from <= previous.to) {
        return "이자율 구간이 서로 겹칩니다.";
      }

      if (segment.from !== addDays(previous.to, 1)) {
        return "이자율 구간 사이에 비어 있는 날짜가 있습니다.";
      }
    }
  }

  return "";
}

function formatOptionLabels(options: CalcOptions) {
  return {
    mode: options.mode === "period" ? "기간식" : "총일수식",
    leapYear: options.leapYear === "fixed365" ? "고정 365일" : "실제 일수(윤년 366)",
    includeFirstDay: options.includeFirstDay ? "초일 산입" : "초일 불산입",
    rounding:
      options.rounding === "ceil" ? "절상" : options.rounding === "round" ? "반올림" : "절사",
  };
}

function formatResultForClipboard(result: InterestResult) {
  const labels = formatOptionLabels(result.options);
  const rows = result.segments
    .map(
      (segment) =>
        `${segment.from}~${segment.to}\t${segment.days}일\t${(segment.rate * 100).toLocaleString(
          "ko-KR",
          { maximumFractionDigits: 3 },
        )}%\t${segment.formula}\t${formatWon(segment.interest)}`,
    )
    .join("\n");

  return [
    "LawCalc Korea 이자 계산 결과",
    `원금: ${formatWon(result.principal)}`,
    `이자 합계: ${formatWon(result.totalInterest)}`,
    `원리금 합계: ${formatWon(result.grandTotal)}`,
    `계산 옵션: ${labels.mode} / ${labels.leapYear} / ${labels.includeFirstDay} / 끝수 ${labels.rounding}`,
    `데이터 버전: ${result.dataVersion}`,
    `계산 시각: ${result.computedAt}`,
    "",
    "시작\t종료\t일수\t이율\t공식\t이자",
    rows,
    "",
    STANDARD_DISCLAIMER,
  ].join("\n");
}

function buildLcalcFile(input: InterestInput, result: InterestResult): LcalcFile {
  const payload: LcalcInterestPayload = {
    appVersion: APP_VERSION,
    dataVersion: result.dataVersion,
    createdAt: new Date().toISOString(),
    input,
    options: input.options,
    result,
    disclaimer: STANDARD_DISCLAIMER,
  };

  if (input.note) {
    payload.note = input.note;
  }

  return {
    schemaVersion: CURRENT_LCALC_SCHEMA_VERSION,
    kind: "interest",
    envelopeFeatures: ["interest@1"],
    dataVersions: { interest: result.dataVersion },
    payload,
  };
}

function buildInterestDirtySnapshot({
  principal,
  startDate,
  endDate,
  segments,
  options,
  preset,
  customRate,
  note,
}: {
  principal: number;
  startDate: string;
  endDate: string;
  segments: RateSegment[];
  options: CalcOptions;
  preset: LegalRatePresetOption;
  customRate: number;
  note: string;
}): string {
  return createLcalcDirtySnapshot({
    principal,
    startDate,
    endDate,
    segments,
    options,
    preset,
    customRate,
    note,
  });
}

export function App() {
  const updaterApi = useUpdater();
  const [principal, setPrincipal] = useState(defaultInput.principal);
  const [startDate, setStartDate] = useState(defaultInput.startDate);
  const [endDate, setEndDate] = useState(defaultInput.endDate);
  const [segments, setSegments] = useState<RateSegment[]>([]);
  const [options, setOptions] = useState<CalcOptions>(defaultOptions);
  const [preset, setPreset] = useState<LegalRatePresetOption>("civil");
  const [customRate, setCustomRate] = useState(0.05);
  const [note, setNote] = useState("");
  const [loadingAction, setLoadingAction] = useState<ActionName | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const calculateButtonRef = useRef<HTMLButtonElement>(null);
  const resultSectionRef = useRef<HTMLElement>(null);
  const skipAutoCalculateRef = useRef(false);
  const dirtySnapshot = useMemo(
    () =>
      buildInterestDirtySnapshot({
        principal,
        startDate,
        endDate,
        segments,
        options,
        preset,
        customRate,
        note,
      }),
    [customRate, endDate, note, options, preset, principal, segments, startDate],
  );
  const markInterestClean = useLcalcDirtyTracker("interest", dirtySnapshot);
  const hasUnsavedLcalcChanges = useHasUnsavedLcalcChanges();
  // 최신 값을 리스너에서 읽는다. 값이 바뀔 때마다 리스너를 다시 붙이면 그 사이에 닫기
  // 이벤트가 오면 놓친다.
  const hasUnsavedRef = useRef(hasUnsavedLcalcChanges);
  hasUnsavedRef.current = hasUnsavedLcalcChanges;

  /**
   * 창을 닫을 때 미저장 경고.
   *
   * Tauri 는 네이티브 창 닫기를 `CloseRequested` 로 가로채므로 `beforeunload` 가 뜨지 않는다.
   * 탭 이동은 패널을 `hidden` 으로만 숨겨 상태가 살아 있으므로 창 닫기만 해당한다.
   * dev 서버(브라우저)에서는 Tauri API 가 없으므로 등록하지 않는다.
   *
   * 확인 창은 **웹뷰의 `window.confirm` 이 아니라 플러그인의 네이티브 다이얼로그**를 쓴다.
   * wry 의 `WryWebViewUIDelegate` 는 파일 업로드 패널·미디어 권한·새 창만 구현하고
   * `runJavaScriptConfirmPanel` 이 없어서, macOS WKWebView 에서 `window.confirm()` 은
   * 아무것도 띄우지 않고 즉시 false 를 반환한다. 그러면 미저장 상태에서 항상 취소로 읽혀
   * **창이 영영 닫히지 않는다.**
   */
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      if (!hasUnsavedRef.current) return;
      const proceed = await ask("저장하지 않은 계산 내용이 있습니다. 창을 닫으면 사라집니다.", {
        title: "LawCalc Korea",
        kind: "warning",
        okLabel: "닫기",
        cancelLabel: "취소",
      });
      if (!proceed) {
        event.preventDefault();
      }
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

  const input = useMemo<InterestInput>(() => {
    const legalRatePreset = toLegalRatePreset(preset, customRate);

    return {
      principal,
      startDate,
      endDate,
      ...(segments.length > 0 ? { segments } : {}),
      ...(legalRatePreset === undefined ? {} : { legalRatePreset }),
      options,
      note,
    };
  }, [customRate, endDate, note, options, preset, principal, segments, startDate]);
  const errors = validateInput(input, preset, customRate);
  const hasErrors = Boolean(
    errors.principal || errors.dateRange || errors.customRate || errors.segments || errors.preset,
  );
  const [calculationError, setCalculationError] = useState("");
  const [result, setResult] = useState<InterestResult>(() => calculateInterest(defaultInput));
  const [claimEnding, setClaimEnding] = useState<ClaimTextEnding>("untilFullPayment");
  const claimText = useMemo(
    () => buildInterestClaimText(result, { ending: claimEnding }),
    [claimEnding, result],
  );
  const [activeTab, setActiveTab] = useState<TabId>("interest");
  const [caseTitle, setCaseTitle] = useState("");
  const [caseToast, setCaseToast] = useState<ToastState | null>(null);
  const interestPristineSnapshotRef = useRef(dirtySnapshot);

  useEffect(() => {
    if (skipAutoCalculateRef.current) {
      skipAutoCalculateRef.current = false;
      return;
    }

    if (hasErrors) {
      return;
    }

    try {
      setResult(calculateInterest(input));
      setCalculationError("");
    } catch (error) {
      setCalculationError(
        error instanceof Error ? error.message : "계산 중 알 수 없는 오류가 발생했습니다.",
      );
    }
  }, [hasErrors, input]);

  const handleCalculate = (focusResult = true) => {
    if (hasErrors) {
      return;
    }

    try {
      setResult(calculateInterest(input));
      setCalculationError("");
      if (focusResult) {
        window.requestAnimationFrame(() => resultSectionRef.current?.focus());
      }
    } catch (error) {
      setCalculationError(
        error instanceof Error ? error.message : "계산 중 알 수 없는 오류가 발생했습니다.",
      );
    }
  };

  const handleReset = () => {
    setPrincipal(defaultInput.principal);
    setStartDate(defaultInput.startDate);
    setEndDate(defaultInput.endDate);
    setSegments([]);
    setOptions(defaultOptions);
    setPreset("civil");
    setCustomRate(0.05);
    setNote("");
    setCalculationError("");
    setResult(calculateInterest(defaultInput));
    window.requestAnimationFrame(() => calculateButtonRef.current?.focus());
  };

  const runAction = async (action: ActionName, task: () => Promise<string | null | void>) => {
    if (loadingAction !== null) {
      return;
    }

    setLoadingAction(action);
    setToast(null);
    try {
      const message = await task();
      if (message) {
        setToast({ type: "success", message });
      }
    } catch (error) {
      setToast({
        type: "error",
        message: error instanceof Error ? error.message : "작업 중 알 수 없는 오류가 발생했습니다.",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSaveLcalc = () =>
    runAction("save", async () => {
      if (hasErrors) {
        throw new Error("입력 오류를 먼저 수정한 뒤 .lcalc 파일을 저장해 주세요.");
      }

      const path = await ipc.saveLcalc(buildLcalcFile(input, result));
      if (path) {
        markInterestClean();
      }
      return path ? `.lcalc 파일을 저장했습니다: ${path}` : "저장을 취소했습니다.";
    });

  const applyLoadedInterestFile = (file: unknown) => {
    const migratedFile = migrateLcalcFile(file);
    validateLcalcEnvelope(migratedFile);
    const loaded = parseLoadedLcalcInput(migratedFile);
    const loadedOptions = {
      ...loaded.input.options,
      rounding: loaded.input.options.rounding ?? "floor",
    };
    const loadedNote = loaded.input.note ?? loaded.note ?? "";
    const cleanSnapshot = buildInterestDirtySnapshot({
      principal: loaded.input.principal,
      startDate: loaded.input.startDate,
      endDate: loaded.input.endDate,
      segments: loaded.input.segments ?? [],
      options: loadedOptions,
      preset: loaded.preset,
      customRate: loaded.customRate,
      note: loadedNote,
    });
    skipAutoCalculateRef.current = true;
    setPrincipal(loaded.input.principal);
    setStartDate(loaded.input.startDate);
    setEndDate(loaded.input.endDate);
    setSegments(loaded.input.segments ?? []);
    setOptions(loadedOptions);
    setPreset(loaded.preset);
    setCustomRate(loaded.customRate);
    setNote(loadedNote);
    setResult(loaded.result);
    setCalculationError("");
    markInterestClean(cleanSnapshot);
  };

  const handleLoadLcalc = () =>
    runAction("load", async () => {
      const file = await ipc.loadLcalc();
      if (!file) {
        return "불러오기를 취소했습니다.";
      }

      applyLoadedInterestFile(file);
      window.requestAnimationFrame(() => resultSectionRef.current?.focus());
      return ".lcalc 파일을 불러왔습니다.";
    });

  useCaseSlot("interest", {
    collect: () => {
      if (dirtySnapshot === interestPristineSnapshotRef.current) {
        return { status: "pristine" };
      }
      if (hasErrors) {
        return { status: "invalid" };
      }
      return { status: "ok", file: buildLcalcFile(input, result) };
    },
    apply: applyLoadedInterestFile,
    markSaved: () => markInterestClean(),
    reset: handleReset,
  });

  const runCaseAction = async (action: ActionName, task: () => Promise<string | null | void>) => {
    if (loadingAction !== null) {
      return;
    }

    setLoadingAction(action);
    setCaseToast(null);
    try {
      const message = await task();
      if (message) {
        setCaseToast({ type: "success", message });
      }
    } catch (error) {
      setCaseToast({
        type: "error",
        message: error instanceof Error ? error.message : "작업 중 알 수 없는 오류가 발생했습니다.",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSaveCase = () =>
    runCaseAction("caseSave", async () => {
      const { calculations, included, invalid } = collectCaseCalculations();
      if (invalid.length > 0) {
        throw new Error(
          `${invalid.map((key) => CASE_CALCULATION_LABELS[key]).join(", ")} 탭의 입력 오류를 수정한 뒤 사건 파일을 저장해 주세요.`,
        );
      }
      if (included.length === 0) {
        throw new Error("저장할 계산이 없습니다. 탭에서 값을 입력한 뒤 다시 시도해 주세요.");
      }

      const trimmedTitle = caseTitle.trim();
      const file = buildCaseLcalcFile(
        trimmedTitle ? { title: trimmedTitle } : {},
        calculations,
        APP_VERSION,
      );
      const path = await ipc.saveLcalc(file);
      if (!path) {
        return "저장을 취소했습니다.";
      }
      markCaseCalculationsSaved(included);
      const labels = included.map((key) => CASE_CALCULATION_LABELS[key]).join(", ");
      return `사건 파일을 저장했습니다 (${labels}): ${path}`;
    });

  const handleLoadCase = () =>
    runCaseAction("caseLoad", async () => {
      const file = await ipc.loadLcalc();
      if (!file) {
        return "불러오기를 취소했습니다.";
      }

      const migratedFile = migrateLcalcFile(file);
      validateLcalcEnvelope(migratedFile);

      if (migratedFile.kind !== "case") {
        // 단일 계산 파일도 사건 열기에서 해당 탭으로 바로 불러온다.
        const applied = applyCaseCalculations({ [migratedFile.kind]: migratedFile });
        const first = applied[0];
        if (!first) {
          throw new Error("이 파일의 계산 유형을 여는 탭이 없습니다.");
        }
        setActiveTab(TAB_BY_CALCULATION[first]);
        return `${CASE_CALCULATION_LABELS[first]} 계산을 불러왔습니다.`;
      }

      const loaded = parseLoadedCaseLcalcInput(migratedFile);
      setCaseTitle(loaded.caseInfo.title ?? loaded.caseInfo.caseNumber ?? "");
      // 완결된 사건 파일 로드 = 워크스페이스 교체. 이 사건에 없는 탭은 초기화해
      // 직전 사건의 잔여 입력이 다음 저장에 섞이는 교차 오염을 막는다.
      const applied = applyCaseCalculations(loaded.calculations, true);
      const first = applied[0];
      if (first) {
        setActiveTab(TAB_BY_CALCULATION[first]);
      }
      const labels = applied.map((key) => CASE_CALCULATION_LABELS[key]).join(", ");
      return `사건 파일을 불러왔습니다 (${labels}).`;
    });

  const handleCopy = () =>
    runAction("copy", async () => {
      await ipc.copyToClipboard(formatResultForClipboard(result));
      return "계산 결과를 클립보드에 복사했습니다.";
    });

  const handleCopyClaim = () =>
    runAction("claim", async () => {
      await ipc.copyToClipboard(claimText);
      return "청구취지 문구를 클립보드에 복사했습니다.";
    });

  const handleExportPdf = () =>
    runAction("pdf", async () => {
      const path = await ipc.exportPdf(result, { path: "lawcalc-interest.pdf", note });
      return path ? `PDF 파일을 저장했습니다: ${path}` : null;
    });

  const handleExportCsv = () =>
    runAction("csv", async () => {
      const path = await ipc.exportCsv(result, "lawcalc-interest.csv");
      return path ? `CSV 파일을 저장했습니다: ${path}` : null;
    });

  useFormShortcuts({
    onSave: () => {
      void handleSaveLcalc();
    },
    onCalculate: () => handleCalculate(),
    onReset: handleReset,
    enabled: activeTab === "interest",
  });

  const fallbackLabel = legalRateOptions[preset].label;

  return (
    <div className="flex min-h-screen flex-col bg-muted/30 text-foreground">
      <Header />

      <nav className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-6xl gap-1 px-4 py-2 sm:px-6" role="tablist">
          {TABS.map((tab) => (
            <Button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              variant={activeTab === tab.id ? "default" : "ghost"}
              size="sm"
              // 색 외의 표시 — 활성 탭에 밑줄과 굵기를 준다.
              className={activeTab === tab.id ? "font-semibold underline underline-offset-4" : ""}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <input
              aria-label="사건번호·사건명"
              className="h-8 w-44 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="사건번호·사건명"
              value={caseTitle}
              onChange={(event) => setCaseTitle(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loadingAction !== null}
              onClick={() => {
                void handleSaveCase();
              }}
            >
              <FolderOutput className="h-4 w-4" aria-hidden="true" />
              사건 저장
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loadingAction !== null}
              onClick={() => {
                void handleLoadCase();
              }}
            >
              <FolderInput className="h-4 w-4" aria-hidden="true" />
              사건 열기
            </Button>
          </div>
        </div>
      </nav>

      {caseToast ? (
        <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6">
          <ToastMessage toast={caseToast} onDismiss={() => setCaseToast(null)} />
        </div>
      ) : null}

      <div
        className={activeTab === "inheritance" ? "contents" : "hidden"}
        role="tabpanel"
        id="tabpanel-inheritance"
        aria-labelledby="tab-inheritance"
      >
        <InheritanceCalculator active={activeTab === "inheritance"} />
      </div>
      <div
        className={activeTab === "litigationCost" ? "contents" : "hidden"}
        role="tabpanel"
        id="tabpanel-litigationCost"
        aria-labelledby="tab-litigationCost"
      >
        <LitigationCostCalculator active={activeTab === "litigationCost"} />
      </div>
      <div
        className={activeTab === "appropriation" ? "contents" : "hidden"}
        role="tabpanel"
        id="tabpanel-appropriation"
        aria-labelledby="tab-appropriation"
      >
        <AppropriationCalculator active={activeTab === "appropriation"} />
      </div>
      <div
        className={activeTab === "compensation" ? "contents" : "hidden"}
        role="tabpanel"
        id="tabpanel-compensation"
        aria-labelledby="tab-compensation"
      >
        <CompensationCalculator active={activeTab === "compensation"} />
      </div>
      {/* 이자 탭의 패널은 이 `main` 자체다. `role="tabpanel"` 을 씌우면 main 랜드마크가
          사라지므로 id 와 라벨만 연결한다 (탭의 `aria-controls` 는 그대로 가리킨다). */}
      <main
        className={`mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[580px_minmax(0,1fr)] ${
          activeTab === "interest" ? "" : "hidden"
        }`}
        id="tabpanel-interest"
        aria-labelledby="tab-interest"
      >
        <section className="space-y-4" aria-labelledby="input-title">
          <Card>
            <CardHeader>
              <CardTitle id="input-title" className="flex items-center gap-2">
                <Calculator className="h-4 w-4" aria-hidden="true" />
                이자 계산 입력
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PrincipalInput value={principal} error={errors.principal} onChange={setPrincipal} />
              <DateRangeInput
                startDate={startDate}
                endDate={endDate}
                error={errors.dateRange}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
              <LegalRatePreset
                value={preset}
                customRate={customRate}
                error={errors.customRate || errors.preset}
                startDate={startDate}
                endDate={endDate}
                onValueChange={setPreset}
                onCustomRateChange={setCustomRate}
              />
              <RateSegmentInput
                fallbackLabel={fallbackLabel}
                value={segments}
                error={errors.segments}
                onChange={setSegments}
              />
              <OptionsPanel value={options} onChange={setOptions} />
              <label className="grid gap-2 text-sm font-medium">
                비고
                <textarea
                  aria-label="비고"
                  className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="예: 1심 판결 선고일부터 완제일까지"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  ref={calculateButtonRef}
                  type="button"
                  disabled={hasErrors}
                  onClick={() => handleCalculate()}
                >
                  계산
                </Button>
                <Button type="button" variant="outline" onClick={handleReset}>
                  초기화
                </Button>
              </div>
              {calculationError ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                  {calculationError}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>

        <section
          ref={resultSectionRef}
          className="space-y-4 focus:outline-none"
          aria-labelledby="result-title"
          tabIndex={-1}
        >
          <SummaryCard result={result} />

          <Card>
            <CardHeader>
              <CardTitle id="result-title" className="flex items-center gap-2">
                <TableProperties className="h-4 w-4" aria-hidden="true" />
                결과 표
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SegmentTable result={result} />
              <LegalCitation dataVersion={result.dataVersion} preset={preset} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" aria-hidden="true" />
                청구취지
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p
                className="rounded-md border border-border bg-muted/40 p-3 text-sm leading-relaxed"
                data-testid="claim-text"
              >
                {claimText}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <fieldset className="flex flex-wrap items-center gap-3">
                  <legend className="sr-only">청구취지 종결 방식</legend>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      checked={claimEnding === "untilFullPayment"}
                      name="claim-ending"
                      type="radio"
                      onChange={() => setClaimEnding("untilFullPayment")}
                    />
                    다 갚는 날까지
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      checked={claimEnding === "untilEndDate"}
                      name="claim-ending"
                      type="radio"
                      onChange={() => setClaimEnding("untilEndDate")}
                    />
                    계산 종료일까지
                  </label>
                </fieldset>
                <ActionButton
                  action="claim"
                  icon={Clipboard}
                  label="복사"
                  loadingAction={loadingAction}
                  variant="outline"
                  onClick={handleCopyClaim}
                />
              </div>
            </CardContent>
          </Card>

          <div
            className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
            data-testid="interest-disclaimer"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{result.disclaimer || STANDARD_DISCLAIMER}</span>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileJson className="h-4 w-4" aria-hidden="true" />
                내보내기
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  action="pdf"
                  icon={FileDown}
                  label="PDF"
                  loadingAction={loadingAction}
                  variant="secondary"
                  onClick={handleExportPdf}
                />
                <ActionButton
                  action="csv"
                  icon={FileSpreadsheet}
                  label="CSV"
                  loadingAction={loadingAction}
                  variant="secondary"
                  onClick={handleExportCsv}
                />
                <ActionButton
                  action="copy"
                  icon={Clipboard}
                  label="복사"
                  loadingAction={loadingAction}
                  variant="outline"
                  onClick={handleCopy}
                />
                <ActionButton
                  action="save"
                  icon={FileJson}
                  label=".lcalc 저장"
                  loadingAction={loadingAction}
                  variant="outline"
                  onClick={handleSaveLcalc}
                />
                <ActionButton
                  action="load"
                  icon={FileJson}
                  label=".lcalc 열기"
                  loadingAction={loadingAction}
                  variant="outline"
                  onClick={handleLoadLcalc}
                />
              </div>
              {toast ? <ToastMessage toast={toast} onDismiss={() => setToast(null)} /> : null}
            </CardContent>
          </Card>
        </section>
      </main>

      <Footer />
      <UpdateDialog api={updaterApi} />
    </div>
  );
}

interface ActionButtonProps {
  action: ActionName;
  icon: LucideIcon;
  label: string;
  loadingAction: ActionName | null;
  variant: "secondary" | "outline";
  onClick: () => Promise<void>;
}

function ActionButton({
  action,
  icon: Icon,
  label,
  loadingAction,
  onClick,
  variant,
}: ActionButtonProps) {
  const isLoading = loadingAction === action;
  const isBusy = loadingAction !== null;

  return (
    <Button
      type="button"
      variant={variant}
      disabled={isBusy}
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
