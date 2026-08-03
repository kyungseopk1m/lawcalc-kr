import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  FileDown,
  FileJson,
  FileSpreadsheet,
  Loader2,
  Scale,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  STANDARD_DISCLAIMER,
  appliedDomains,
  caseCode,
  computeLitigationCost,
  listCaseTypes,
  type AppealsLevel,
  type CaseType,
  type LawyerFeeDiscount,
  type LitigationCostInput,
  type LitigationCostResult,
} from "@lawcalc-kr/core-engine";

import { ProportionalPillInput } from "../components/form/ProportionalPillInput";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { useFormShortcuts } from "../hooks/use-form-shortcuts";
import { useCaseSlot } from "../lib/case-file";
import { formatWon, formatWonInput, parseWonText } from "../lib/format-won";
import { ipc, type LcalcFile, type LcalcLitigationCostPayload } from "../lib/ipc";
import { createLcalcDirtySnapshot, useLcalcDirtyTracker } from "../lib/lcalc-dirty-state";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "../lib/lcalc-migrations";
import {
  parseLoadedLitigationCostLcalcInput,
  validateLcalcEnvelope,
} from "../lib/lcalc-validation";

const APP_VERSION = __APP_VERSION__;

type ActionName = "pdf" | "csv" | "copy" | "save" | "load";
type DistributionMode = "equal" | "proportional";

interface ToastState {
  type: "success" | "error";
  message: string;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatComputedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value: string, fallback: number): number {
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

const PROPORTIONAL_VALUE_TOKEN = /^\d{1,3}(?:,\d{3})+$|^\d+$/;

export function parseProportionalValues(value: string): number[] {
  return value
    .split(/(?:,\s+|\s+|\/)+/)
    .filter((part) => PROPORTIONAL_VALUE_TOKEN.test(part))
    .map((part) => Number(part.replaceAll(",", "")))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * v0.10.0 이하는 지급명령 감액 체크박스 값을 사건구분과 별개로 `stampDuty.isPaymentOrder` 에
 * 저장했다. 체크박스를 없앤 뒤로 이 값을 흘려보내지 않으면 구파일을 다시 계산할 때 제7조 ②항
 * 1/10 이 소리 없이 풀린다.
 *
 * 사건구분을 `paymentOrder` 로 바꾸는 방법은 쓰지 않았다. 그 사건구분은 변호사보수 산입
 * 대상이 아니라 구파일의 보수와 송달료까지 같이 달라진다.
 */
export function hasLegacyPaymentOrderFlag(stampDuty: LitigationCostInput["stampDuty"]): boolean {
  return stampDuty.isPaymentOrder === true && stampDuty.caseType !== "paymentOrder";
}

/**
 * 인지대 입력 조립. 심급 강제와 특별절차 배타를 한 곳에 모아, validator 가 거부하는 조합
 * (지급명령·화해 + 항소심, 보전처분 + 특별절차)이 UI 에서 만들어질 수 없게 한다.
 */
export function buildStampDutyInput(state: {
  caseValue: number;
  caseType: CaseType;
  appealsLevel: AppealsLevel;
  legacyPaymentOrder: boolean;
  isSettlement: boolean;
  isElectronicFiling: boolean;
  provisionalMeasureType: "general" | "provisionalStatus";
  filingDate: string;
}): LitigationCostInput["stampDuty"] {
  const isProvisional =
    state.caseType === "provisionalMeasureCollegial" ||
    state.caseType === "provisionalMeasureSingle";
  // 보전처분은 제9조 ②항 별도 체계라 지급명령 감액 자체가 성립하지 않는다 (validator 도 거부).
  const isPaymentOrder =
    !isProvisional && (state.caseType === "paymentOrder" || state.legacyPaymentOrder);
  const appealsLevel: AppealsLevel =
    isProvisional || isPaymentOrder ? "firstInstance" : state.appealsLevel;

  return {
    caseValue: state.caseValue,
    caseType: state.caseType,
    appealsLevel,
    ...(isProvisional ? { provisionalMeasureType: state.provisionalMeasureType } : {}),
    // 사건구분이 차(paymentOrder)면 엔진이 자동 파생한다. 구파일 플래그일 때만 명시 전달.
    ...(isPaymentOrder && state.caseType !== "paymentOrder" ? { isPaymentOrder: true } : {}),
    ...(state.isSettlement && !isProvisional && !isPaymentOrder ? { isSettlement: true } : {}),
    ...(state.isElectronicFiling ? { isElectronicFiling: true } : {}),
    ...(state.filingDate ? { filingDate: state.filingDate } : {}),
  };
}

function distributionLabel(mode: DistributionMode) {
  return mode === "equal" ? "균등" : "소가 비례";
}

function formatLitigationCostForClipboard(result: LitigationCostResult): string {
  const distributionRows =
    result.distribution?.perParty
      .map((amount, index) => `당사자 ${index + 1}\t${formatWon(amount)}`)
      .join("\n") ?? "";

  return [
    "LawCalc Korea 소송비용 계산 결과",
    `인지대: ${formatWon(result.stampDuty.amount)}`,
    `송달료: ${formatWon(result.deliveryFee.amount)}`,
    `변호사보수: ${formatWon(result.lawyerFee.amount)}`,
    `합계: ${formatWon(result.totalAmount)}`,
    `데이터 버전: stamp-duty=${result.dataVersions["stamp-duty"]} / delivery=${result.dataVersions.delivery} / lawyer-fee=${result.dataVersions["lawyer-fee"]}`,
    `계산 시각: ${result.computedAt}`,
    "",
    "산식",
    `인지대\t${result.stampDuty.formulaText}`,
    `송달료\t${result.deliveryFee.formulaText}`,
    `변호사보수\t${result.lawyerFee.formulaText}`,
    ...(result.distribution
      ? [
          "",
          `분배 방식: ${distributionLabel(result.distribution.mode)}`,
          "당사자\t분배액",
          distributionRows,
        ]
      : []),
    "",
    STANDARD_DISCLAIMER,
  ].join("\n");
}

function buildLcalcFile(
  input: LitigationCostInput,
  result: LitigationCostResult,
  note: string,
): LcalcFile {
  const payload: LcalcLitigationCostPayload = {
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    input,
    result: { ...result, disclaimer: STANDARD_DISCLAIMER },
    disclaimer: STANDARD_DISCLAIMER,
  };

  if (note.trim()) {
    payload.note = note.trim();
  }

  return {
    schemaVersion: CURRENT_LCALC_SCHEMA_VERSION,
    kind: "litigation-cost",
    envelopeFeatures: ["litigation-cost@1"],
    dataVersions: {
      "stamp-duty": result.dataVersions["stamp-duty"]!,
      delivery: result.dataVersions.delivery!,
      "lawyer-fee": result.dataVersions["lawyer-fee"]!,
    },
    payload,
  };
}

function buildDirtySnapshot(input: LitigationCostInput, note: string) {
  return createLcalcDirtySnapshot({ input, note });
}

const caseTypeOptions = listCaseTypes();

export function LitigationCostCalculator({ active = true }: { active?: boolean }) {
  const [caseType, setCaseType] = useState<CaseType>("civilFirstInstanceSingle");
  const [caseValueText, setCaseValueText] = useState("30000000");
  const [appealsLevel, setAppealsLevel] = useState<AppealsLevel>("firstInstance");
  const [appealValueText, setAppealValueText] = useState("30000000");
  const [partyCountText, setPartyCountText] = useState("2");
  const [filingDate, setFilingDate] = useState(todayIso());
  const [isElectronicFiling, setIsElectronicFiling] = useState(false);
  const [isSettlement, setIsSettlement] = useState(false);
  const [provisionalMeasureType, setProvisionalMeasureType] = useState<
    "general" | "provisionalStatus"
  >("general");
  // v0.10.0 이하 파일에서 읽어온 지급명령 플래그. 사건구분을 바꾸면 해제된다.
  const [legacyPaymentOrder, setLegacyPaymentOrder] = useState(false);
  const [agreedFeeText, setAgreedFeeText] = useState("");
  const [applyNoOral, setApplyNoOral] = useState(false);
  const [applyProvisionalDiscount, setApplyProvisionalDiscount] = useState(false);
  const [applyKoreaLegalAid, setApplyKoreaLegalAid] = useState(false);
  const [koreaLegalAidAgreedFeeText, setKoreaLegalAidAgreedFeeText] = useState("");
  const [courtMultiplierText, setCourtMultiplierText] = useState("1");
  const [customRateText, setCustomRateText] = useState("1");
  const [useCourtMultiplier, setUseCourtMultiplier] = useState(false);
  const [useCustomRate, setUseCustomRate] = useState(false);
  const [distributionMode, setDistributionMode] = useState<DistributionMode>("equal");
  const [proportionalValuesText, setProportionalValuesText] = useState("10000000, 20000000");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<LitigationCostResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<ActionName | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const input = useMemo<LitigationCostInput>(() => {
    const caseValue = parseNonNegativeInteger(caseValueText, 0);
    const partyCount = parsePositiveInteger(partyCountText, 1);
    const lawyerFeeAppliesNow = appliedDomains(caseType).includes("lawyerFee");
    // 지급명령(차)과 보전처분(카합/카단)은 심급 배수를 쓰지 않으므로 1심으로 고정한다.
    const stampDuty = buildStampDutyInput({
      caseValue,
      caseType,
      appealsLevel,
      legacyPaymentOrder,
      isSettlement,
      isElectronicFiling,
      provisionalMeasureType,
      filingDate,
    });
    const effectiveAppealsLevel = stampDuty.appealsLevel;
    const lawyerCaseValue =
      effectiveAppealsLevel === "firstInstance"
        ? caseValue
        : parseNonNegativeInteger(appealValueText, caseValue);
    const discounts: LawyerFeeDiscount[] = [];
    if (lawyerFeeAppliesNow) {
      if (applyNoOral) {
        discounts.push({ kind: "noOralHearingOrAdmission", reason: "noOralHearing" });
      }
      // 제3조 ②항은 가압류·가처분 사건구분에만 적용된다 (validator 가 그 외 조합을 거부).
      // 본문 1/2 은 엔진이 caseType 으로 자동 적용하므로, 여기서는 단서(산입 불가)만 전달한다.
      if (
        applyProvisionalDiscount &&
        (caseType === "provisionalMeasureCollegial" || caseType === "provisionalMeasureSingle")
      ) {
        discounts.push({ kind: "provisionalCase", hasOralHearing: false });
      }
      if (applyKoreaLegalAid) {
        discounts.push({ kind: "koreaLegalAid" });
      }
      if (useCourtMultiplier) {
        discounts.push({
          kind: "courtDiscretion",
          multiplier: Number(courtMultiplierText),
        });
      }
      if (useCustomRate) {
        discounts.push({ kind: "customPercent", rate: Number(customRateText) });
      }
    }

    const base: LitigationCostInput = {
      stampDuty,
      deliveryFee: {
        caseType,
        partyCount,
        ...(filingDate ? { filingDate } : {}),
      },
      lawyerFee: {
        caseValue: lawyerCaseValue,
        caseType,
        discounts,
        ...(filingDate ? { filingDate } : {}),
        ...(lawyerFeeAppliesNow && koreaLegalAidAgreedFeeText.trim()
          ? { koreaLegalAidAgreedFeeWon: parseNonNegativeInteger(koreaLegalAidAgreedFeeText, 0) }
          : {}),
        ...(lawyerFeeAppliesNow && agreedFeeText.trim()
          ? { agreedFeeWon: parseNonNegativeInteger(agreedFeeText, 0) }
          : {}),
      },
    };

    if (distributionMode === "proportional") {
      return {
        ...base,
        distribution: {
          mode: "proportional",
          partyValuesWon: parseProportionalValues(proportionalValuesText),
        },
      };
    }

    return { ...base, distribution: { mode: "equal", partyCount } };
  }, [
    agreedFeeText,
    appealValueText,
    appealsLevel,
    applyKoreaLegalAid,
    applyNoOral,
    applyProvisionalDiscount,
    caseType,
    caseValueText,
    courtMultiplierText,
    customRateText,
    distributionMode,
    filingDate,
    isElectronicFiling,
    isSettlement,
    koreaLegalAidAgreedFeeText,
    legacyPaymentOrder,
    partyCountText,
    proportionalValuesText,
    provisionalMeasureType,
    useCourtMultiplier,
    useCustomRate,
  ]);
  const lawyerFeeApplies = useMemo(
    () => appliedDomains(caseType).includes("lawyerFee"),
    [caseType],
  );
  const isProvisionalCase =
    caseType === "provisionalMeasureCollegial" || caseType === "provisionalMeasureSingle";
  const isPaymentOrderCase = caseType === "paymentOrder";
  // 구파일 플래그도 지급명령과 같은 배타 규칙을 받는다 (1심 고정, 화해 배타).
  const paymentOrderApplies = isPaymentOrderCase || (legacyPaymentOrder && !isProvisionalCase);
  const dirtySnapshot = useMemo(() => buildDirtySnapshot(input, note), [input, note]);
  const markLitigationCostClean = useLcalcDirtyTracker("litigation-cost", dirtySnapshot);
  const pristineSnapshotRef = useRef(dirtySnapshot);

  const applyInput = (loaded: LitigationCostInput) => {
    setCaseType(loaded.stampDuty.caseType);
    setCaseValueText(String(loaded.stampDuty.caseValue));
    setAppealsLevel(loaded.stampDuty.appealsLevel);
    setAppealValueText(String(loaded.lawyerFee.caseValue));
    setPartyCountText(String(loaded.deliveryFee.partyCount));
    setFilingDate(
      loaded.stampDuty.filingDate ??
        loaded.deliveryFee.filingDate ??
        loaded.lawyerFee.filingDate ??
        todayIso(),
    );
    setIsElectronicFiling(Boolean(loaded.stampDuty.isElectronicFiling));
    setIsSettlement(Boolean(loaded.stampDuty.isSettlement));
    setLegacyPaymentOrder(hasLegacyPaymentOrderFlag(loaded.stampDuty));
    setProvisionalMeasureType(loaded.stampDuty.provisionalMeasureType ?? "general");
    setApplyNoOral(loaded.lawyerFee.discounts.some((d) => d.kind === "noOralHearingOrAdmission"));
    setApplyProvisionalDiscount(
      loaded.lawyerFee.discounts.some((d) => d.kind === "provisionalCase"),
    );
    setApplyKoreaLegalAid(loaded.lawyerFee.discounts.some((d) => d.kind === "koreaLegalAid"));
    const court = loaded.lawyerFee.discounts.find((d) => d.kind === "courtDiscretion");
    setUseCourtMultiplier(court !== undefined);
    setCourtMultiplierText(court?.kind === "courtDiscretion" ? String(court.multiplier) : "1");
    const custom = loaded.lawyerFee.discounts.find((d) => d.kind === "customPercent");
    setUseCustomRate(custom !== undefined);
    setCustomRateText(custom?.kind === "customPercent" ? String(custom.rate) : "1");
    setKoreaLegalAidAgreedFeeText(
      loaded.lawyerFee.koreaLegalAidAgreedFeeWon === undefined
        ? ""
        : String(loaded.lawyerFee.koreaLegalAidAgreedFeeWon),
    );
    setAgreedFeeText(
      loaded.lawyerFee.agreedFeeWon === undefined ? "" : String(loaded.lawyerFee.agreedFeeWon),
    );
    setDistributionMode(loaded.distribution?.mode ?? "equal");
    setProportionalValuesText(loaded.distribution?.partyValuesWon?.join(", ") ?? "");
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

  const handleCalculate = () => {
    try {
      const calculated = computeLitigationCost(input);
      setResult(calculated);
      setError(null);
      setToast(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReset = () => {
    setCaseType("civilFirstInstanceSingle");
    setCaseValueText("30000000");
    setAppealsLevel("firstInstance");
    setAppealValueText("30000000");
    setPartyCountText("2");
    setFilingDate(todayIso());
    setIsElectronicFiling(false);
    setIsSettlement(false);
    setProvisionalMeasureType("general");
    setAgreedFeeText("");
    setApplyNoOral(false);
    setApplyProvisionalDiscount(false);
    setApplyKoreaLegalAid(false);
    setKoreaLegalAidAgreedFeeText("");
    setCourtMultiplierText("1");
    setCustomRateText("1");
    setUseCourtMultiplier(false);
    setUseCustomRate(false);
    setDistributionMode("equal");
    setProportionalValuesText("10000000, 20000000");
    setNote("");
    setResult(null);
    setError(null);
    setToast(null);
  };

  const handleExportPdf = () =>
    runAction("pdf", async () => {
      if (!result) throw new Error("계산 후 PDF를 저장해 주세요.");
      const path = await ipc.exportLitigationCostPdf(result);
      return path ? `PDF 파일을 저장했습니다: ${path}` : null;
    });

  const handleExportCsv = () =>
    runAction("csv", async () => {
      if (!result) throw new Error("계산 후 CSV를 저장해 주세요.");
      const path = await ipc.exportLitigationCostCsv(result);
      return path ? `CSV 파일을 저장했습니다: ${path}` : null;
    });

  const handleCopy = () =>
    runAction("copy", async () => {
      if (!result) throw new Error("계산 후 복사해 주세요.");
      await ipc.copyToClipboard(formatLitigationCostForClipboard(result));
      return "소송비용 계산 결과를 클립보드에 복사했습니다.";
    });

  const handleSaveLcalc = () =>
    runAction("save", async () => {
      if (!result) throw new Error("계산 후 .lcalc 파일을 저장해 주세요.");
      const path = await ipc.saveLcalc(buildLcalcFile(input, result, note));
      if (path) markLitigationCostClean();
      return path ? `.lcalc 파일을 저장했습니다: ${path}` : "저장을 취소했습니다.";
    });

  useFormShortcuts({
    onSave: () => {
      void handleSaveLcalc();
    },
    onCalculate: handleCalculate,
    onReset: handleReset,
    enabled: active,
  });

  const applyLoadedFile = (file: unknown) => {
    const migratedFile = migrateLcalcFile(file);
    validateLcalcEnvelope(migratedFile);
    const loaded = parseLoadedLitigationCostLcalcInput(migratedFile);
    const loadedNote = loaded.note ?? "";
    applyInput(loaded.input);
    setNote(loadedNote);
    setResult(loaded.result ?? computeLitigationCost(loaded.input));
    setError(null);
    markLitigationCostClean(buildDirtySnapshot(loaded.input, loadedNote));
  };

  useCaseSlot("litigation-cost", {
    collect: () => {
      if (dirtySnapshot === pristineSnapshotRef.current) {
        return { status: "pristine" };
      }
      try {
        return { status: "ok", file: buildLcalcFile(input, computeLitigationCost(input), note) };
      } catch {
        return { status: "invalid" };
      }
    },
    apply: applyLoadedFile,
    markSaved: () => markLitigationCostClean(),
    reset: handleReset,
  });

  const handleLoadLcalc = () =>
    runAction("load", async () => {
      const file = await ipc.loadLcalc();
      if (!file) return "불러오기를 취소했습니다.";

      applyLoadedFile(file);
      return ".lcalc 파일을 불러왔습니다.";
    });

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[580px_minmax(0,1fr)]">
      <div className="grid gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Scale className="h-4 w-4" aria-hidden="true" />
              소송비용 입력
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <label className="grid gap-2 text-sm font-medium">
              사건구분
              <Select
                value={caseType}
                onChange={(e) => {
                  setCaseType(e.target.value as CaseType);
                  // 사용자가 사건구분을 직접 고르면 구파일 플래그는 물러난다.
                  setLegacyPaymentOrder(false);
                }}
              >
                {caseTypeOptions.map(({ caseType: value, meta }) => {
                  const lawyerFeeExcluded = !appliedDomains(value).includes("lawyerFee");
                  return (
                    <option key={value} value={value}>
                      {meta.nameKo} ({caseCode(value)})
                      {lawyerFeeExcluded ? " - 변호사보수 산입 외" : ""}
                    </option>
                  );
                })}
              </Select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                소가
                <Input
                  value={formatWonInput(caseValueText)}
                  inputMode="numeric"
                  placeholder="예: 30,000,000"
                  onChange={(e) => setCaseValueText(parseWonText(e.target.value))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                당사자수
                <Input
                  value={partyCountText}
                  inputMode="numeric"
                  onChange={(e) => setPartyCountText(e.target.value)}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                심급
                <Select
                  value={appealsLevel}
                  disabled={isProvisionalCase || paymentOrderApplies}
                  onChange={(e) => setAppealsLevel(e.target.value as AppealsLevel)}
                >
                  <option value="firstInstance">1심</option>
                  <option value="appeal">항소</option>
                  <option value="supreme">상고</option>
                </Select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                항소·상고 불복 범위
                <Input
                  value={formatWonInput(appealValueText)}
                  inputMode="numeric"
                  placeholder="예: 30,000,000"
                  disabled={
                    appealsLevel === "firstInstance" || isProvisionalCase || paymentOrderApplies
                  }
                  onChange={(e) => setAppealValueText(parseWonText(e.target.value))}
                />
              </label>
            </div>
            {isProvisionalCase ? (
              <label className="grid gap-2 text-sm font-medium">
                보전처분 종류 (인지법 제9조 ②항)
                <Select
                  value={provisionalMeasureType}
                  onChange={(e) =>
                    setProvisionalMeasureType(e.target.value as "general" | "provisionalStatus")
                  }
                >
                  <option value="general">가압류·다툼대상 가처분 (정액 1만원)</option>
                  <option value="provisionalStatus">
                    임시의 지위를 정하는 가처분 (본안 1/2, 상한 50만원)
                  </option>
                </Select>
              </label>
            ) : null}
            <label className="grid gap-2 text-sm font-medium">
              접수일
              <Input
                type="date"
                value={filingDate}
                onChange={(e) => setFilingDate(e.target.value)}
              />
            </label>
            <div className="grid gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isElectronicFiling}
                  onChange={(e) => setIsElectronicFiling(e.target.checked)}
                />
                전자소송
              </label>
              {isPaymentOrderCase ? (
                <p className="text-xs text-muted-foreground">
                  독촉사건(지급명령)은 인지법 제7조 ②항에 따라 소장 인지의 1/10이 자동 적용됩니다.
                </p>
              ) : null}
              {legacyPaymentOrder && !isProvisionalCase ? (
                <div className="flex items-start justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  <span>
                    이전 버전에서 지급명령 인지대 감액(제7조 ②항 1/10)이 적용된 상태로 저장된
                    파일입니다. 감액을 유지한 채 계산합니다. 사건구분을 바꾸면 해제됩니다.
                  </span>
                  <button
                    type="button"
                    className="shrink-0 underline underline-offset-2"
                    onClick={() => setLegacyPaymentOrder(false)}
                  >
                    해제
                  </button>
                </div>
              ) : null}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isSettlement}
                  disabled={isProvisionalCase || paymentOrderApplies}
                  onChange={(e) => setIsSettlement(e.target.checked)}
                />
                화해 인지대 감액
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">변호사보수 옵션</CardTitle>
            <p className="text-xs text-muted-foreground">
              「변호사보수의 소송비용 산입에 관한 규칙」 기준 (아래 옵션의 제3·5·6조는 같은 규칙
              조항).
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0 text-sm">
            {!lawyerFeeApplies ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                선택한 사건구분은 「변호사보수의 소송비용 산입에 관한 규칙」 제3조 ①항 본안 사건에
                해당하지 않아 변호사보수가 산입되지 않습니다. 인지대·송달료만 계산됩니다.
              </div>
            ) : null}
            <fieldset disabled={!lawyerFeeApplies} className="grid gap-3 disabled:opacity-60">
              <label className="grid gap-2 font-medium">
                지급보수액 (실제 약정보수, 제3조 ①항)
                <Input
                  aria-label="지급보수액"
                  placeholder="예: 3,000,000 (미입력 시 별표 상한액)"
                  value={formatWonInput(agreedFeeText)}
                  inputMode="numeric"
                  onChange={(e) => setAgreedFeeText(parseWonText(e.target.value))}
                />
                {lawyerFeeApplies && !agreedFeeText.trim() ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    지급보수액을 넣지 않으면 산정액은 별표 상한액이고, 실제 산입액은 지급보수액 범위
                    내로 제한됩니다.
                  </span>
                ) : null}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={applyNoOral}
                  onChange={(e) => setApplyNoOral(e.target.checked)}
                />
                무변론·자백 등 제5조 감액
              </label>
              {isProvisionalCase ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    가압류·가처분 사건은 제3조 ②항 본문에 따라 별표 산정액의 1/2이 자동 적용됩니다.
                  </p>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={applyProvisionalDiscount}
                      onChange={(e) => setApplyProvisionalDiscount(e.target.checked)}
                    />
                    신청사건이고 변론·심문을 거치지 않음 (제3조 ②항 단서, 산입 불가)
                  </label>
                </>
              ) : null}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={applyKoreaLegalAid}
                  onChange={(e) => setApplyKoreaLegalAid(e.target.checked)}
                />
                대한법률구조공단 기준 적용
              </label>
              <Input
                aria-label="대한법률구조공단 약정보수액"
                placeholder="대한법률구조공단 약정보수액 (선택)"
                value={formatWonInput(koreaLegalAidAgreedFeeText)}
                inputMode="numeric"
                onChange={(e) => setKoreaLegalAidAgreedFeeText(parseWonText(e.target.value))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={useCourtMultiplier}
                      onChange={(e) => setUseCourtMultiplier(e.target.checked)}
                    />
                    재량 배율
                  </span>
                  <Input
                    value={courtMultiplierText}
                    onChange={(e) => setCourtMultiplierText(e.target.value)}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={useCustomRate}
                      onChange={(e) => setUseCustomRate(e.target.checked)}
                    />
                    직접 배율
                  </span>
                  <Input
                    value={customRateText}
                    onChange={(e) => setCustomRateText(e.target.value)}
                  />
                </label>
              </div>
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">분배</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={distributionMode === "equal" ? "default" : "outline"}
                onClick={() => setDistributionMode("equal")}
              >
                균등
              </Button>
              <Button
                type="button"
                size="sm"
                variant={distributionMode === "proportional" ? "default" : "outline"}
                onClick={() => setDistributionMode("proportional")}
              >
                소가 비례
              </Button>
            </div>
            {distributionMode === "proportional" ? (
              <label className="grid gap-2 text-sm font-medium">
                당사자별 소가
                <ProportionalPillInput
                  value={proportionalValuesText}
                  onChange={setProportionalValuesText}
                  placeholder="예: 10,000,000"
                  ariaLabel="당사자별 소가"
                />
              </label>
            ) : null}
            <label className="grid gap-2 text-sm font-medium">
              비고
              <textarea
                aria-label="소송비용 계산 비고"
                className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <Button onClick={handleCalculate} type="button">
              계산
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {result ? (
          <>
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">계산 결과</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 pt-0">
                <ResultLine
                  label="인지대"
                  amount={result.stampDuty.amount}
                  formula={result.stampDuty.formulaText}
                />
                <ResultLine
                  label="송달료"
                  amount={result.deliveryFee.amount}
                  formula={result.deliveryFee.formulaText}
                />
                <ResultLine
                  label="변호사보수"
                  amount={result.lawyerFee.amount}
                  formula={result.lawyerFee.formulaText}
                />
                <div className="flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
                  <span>합계</span>
                  <span>{formatWon(result.totalAmount)}</span>
                </div>
                <div className="grid gap-1 text-xs text-muted-foreground">
                  <span>
                    데이터 버전: {result.dataVersions["stamp-duty"]} /{" "}
                    {result.dataVersions.delivery} / {result.dataVersions["lawyer-fee"]}
                  </span>
                  <span>계산 시각: {formatComputedAt(result.computedAt)}</span>
                </div>
              </CardContent>
            </Card>

            {result.lawyerFee.koreaLegalAidWarnings.length > 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {result.lawyerFee.koreaLegalAidWarnings.map((w) => w.messageKo).join(" / ")}
                </span>
              </div>
            ) : null}

            {result.distribution ? (
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm">분배표</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-2 font-medium">당사자</th>
                        <th className="py-2 text-right font-medium">분배액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.distribution.perParty.map((amount, index) => (
                        <tr key={index} className="border-b border-border last:border-b-0">
                          <td className="py-2">당사자 {index + 1}</td>
                          <td className="py-2 text-right font-medium">{formatWon(amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
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
      </div>
    </main>
  );
}

function ResultLine({
  label,
  amount,
  formula,
}: {
  label: string;
  amount: number;
  formula: string;
}) {
  return (
    <div className="grid gap-1 border-b border-border pb-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-semibold">{formatWon(amount)}</span>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{formula}</p>
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
