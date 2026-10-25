import {
  CheckCircle2,
  Clipboard,
  FileDown,
  FileJson,
  FileSpreadsheet,
  Loader2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  STANDARD_DISCLAIMER,
  calculateInheritance,
  type HeirNode,
  type InheritanceInput,
  type InheritanceResult,
} from "@lawcalc-kr/core-engine";

import {
  HEIR_GROUP_HINTS,
  HeirGroupCard,
  applyInheritanceInput,
  buildInheritanceInput,
  hasInheritanceOldLawFields,
  hasInheritanceV2Fields,
  heirsForDirtySnapshot,
  isOldLawDate,
  type DecedentInput,
  type HeirInput,
  type SpouseInput,
} from "../components/inheritance-heirs";
import { ResultFreshnessNotice } from "../components/result/ResultFreshnessNotice";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Notice } from "../components/ui/notice";
import { Input } from "../components/ui/input";
import { useFormShortcuts } from "../hooks/use-form-shortcuts";
import { useResultFingerprint } from "../hooks/use-result-fingerprint";
import { useCaseSlot } from "../lib/case-file";
import { formatWon, formatWonInput, parseWonText } from "../lib/format-won";
import { ipc, type LcalcFile, type LcalcInheritancePayload } from "../lib/ipc";
import { createLcalcDirtySnapshot, useLcalcDirtyTracker } from "../lib/lcalc-dirty-state";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "../lib/lcalc-migrations";
import { parseLoadedInheritanceLcalcInput, validateLcalcEnvelope } from "../lib/lcalc-validation";

const APP_VERSION = __APP_VERSION__;

type ActionName = "pdf" | "hwpx" | "csv" | "copy" | "save" | "load";

interface ToastState {
  type: "success" | "error";
  message: string;
}

function heirsFromNodesForDirtySnapshot(heirs: HeirNode[] | undefined, defaultDegree?: number) {
  return (
    heirs?.map((heir) => ({
      name: heir.name ?? "",
      deceasedBeforeOpening: heir.deceasedBeforeOpening,
      renounced: heir.renounced ?? false,
      degree: heir.degree ?? defaultDegree,
      sex: heir.sex,
      sameFamilyRegister: heir.sameFamilyRegister,
      hojuSuccessor: heir.hojuSuccessor || undefined,
      representatives:
        heir.representatives?.map((representative) => ({
          name: representative.name ?? "",
          isSpouseOfRepresented: representative.isSpouseOfRepresented ?? false,
          renounced: representative.renounced ?? false,
          sex: representative.sex,
          sameFamilyRegister: representative.sameFamilyRegister,
        })) ?? [],
    })) ?? []
  );
}

function buildInheritanceDirtySnapshot({
  decedent,
  spouse,
  linealDescendants,
  linealAscendants,
  siblings,
  collateralFourth,
  estateText,
  note,
}: {
  decedent: DecedentInput;
  spouse: SpouseInput;
  linealDescendants: HeirInput[];
  linealAscendants: HeirInput[];
  siblings: HeirInput[];
  collateralFourth: HeirInput[];
  estateText: string;
  note: string;
}) {
  return createLcalcDirtySnapshot({
    decedent,
    spouse,
    linealDescendants: heirsForDirtySnapshot(linealDescendants),
    linealAscendants: heirsForDirtySnapshot(linealAscendants),
    siblings: heirsForDirtySnapshot(siblings),
    collateralFourth: heirsForDirtySnapshot(collateralFourth),
    estateText,
    note,
  });
}

function buildLoadedInheritanceDirtySnapshot(input: InheritanceInput, note: string) {
  return createLcalcDirtySnapshot({
    decedent: {
      name: input.decedent.name ?? "",
      deceasedAt: input.decedent.deceasedAt,
    },
    spouse: {
      alive: input.spouse?.alive ?? false,
      name: input.spouse?.name ?? "",
      relation: input.spouse?.relation,
    },
    linealDescendants: heirsFromNodesForDirtySnapshot(input.linealDescendants),
    linealAscendants: heirsFromNodesForDirtySnapshot(input.linealAscendants, 1),
    siblings: heirsFromNodesForDirtySnapshot(input.siblings),
    collateralFourth: heirsFromNodesForDirtySnapshot(input.collateralFourth, 3),
    estateText: input.estateWon === undefined ? "" : String(input.estateWon),
    note,
  });
}

function formatPercent(num: number, den: number): string {
  if (den === 0) return "—";
  return `${((num / den) * 100).toFixed(2)}%`;
}

function formatComputedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** 상속재산 입력 문자열 → 엔진 입력 키. 비어 있으면 키를 싣지 않아 종전 결과 모양 그대로다. */
export function withEstate(input: InheritanceInput, estateText: string): InheritanceInput {
  const digits = parseWonText(estateText);
  return digits === "" ? input : { ...input, estateWon: Number(digits) };
}

/**
 * 화면 계산. 전개식은 금액이 없어도 보이도록 `includeTrace` 를 붙인다. 이 키는 결과 모양만
 * 바꾸므로 저장 입력에는 싣지 않는다 (구파일·구앱과 같은 입력).
 */
export function computeInheritance(input: InheritanceInput): InheritanceResult {
  return calculateInheritance({ ...input, includeTrace: true });
}

/**
 * 저장 capability. 구법 필드가 있으면 `inheritance@4`, 상속재산 금액이 있으면 `inheritance@3`
 * (구앱이 키를 버리면 금액 없는 결과를 그대로 보여 준다), 포기·대습 원인이 있으면 `@2`, 없으면 `@1`.
 */
/**
 * 파일 열기 때 저장 결과와 재계산 결과를 견주는 핵심 값. 지분이 같아도 상속재산 금액이나
 * 상속인별 금액·끝수가 다르면 "저장 당시 결과와 다릅니다" 안내가 떠야 하므로 금액도 넣는다.
 */
export function summarizeInheritanceResult(r: InheritanceResult): string {
  const won = (n: number | undefined) => (n === undefined ? "" : ` ${n.toLocaleString("ko-KR")}원`);
  const shares = r.shares
    .map((s) => `${s.name} ${s.numerator}/${s.denominator}${won(s.amountWon)}`)
    .join(", ");
  return r.estateWon === undefined
    ? shares
    : `${shares} · 상속재산${won(r.estateWon)} · 끝수${won(r.remainderWon)}`;
}

export function inheritanceCapability(input: InheritanceInput): string {
  // 구법 필드(성별·가적·호주상속·처/남편)를 구앱이 버리면 1991 전 사망이 거부되거나 지분이 달라진다.
  if (hasInheritanceOldLawFields(input)) return "inheritance@4";
  if (input.estateWon !== undefined) return "inheritance@3";
  return hasInheritanceV2Fields(input) ? "inheritance@2" : "inheritance@1";
}

/** 상속인별 금액 합 + 끝수. 엔진 계약상 상속재산과 같아야 하며 화면은 이 합을 보여 준다. */
export function inheritanceAmountTotal(result: InheritanceResult): number {
  return result.shares.reduce((sum, s) => sum + (s.amountWon ?? 0), result.remainderWon ?? 0);
}

export function formatInheritanceForClipboard(result: InheritanceResult): string {
  const hasAmount = result.estateWon !== undefined;
  const rows = result.shares
    .map(
      (share) =>
        `${share.name}\t${share.numerator}/${share.denominator}\t${share.rawNumerator}/${share.rawDenominator}\t${formatPercent(
          share.numerator,
          share.denominator,
        )}` + (hasAmount ? `\t${formatWon(share.amountWon ?? 0)}원` : ""),
    )
    .join("\n");

  return [
    "LawCalc Korea 상속분 간이 계산 결과",
    `피상속인: ${result.decedent.name ?? "-"}`,
    `사망일: ${result.decedent.deceasedAt}`,
    ...(hasAmount
      ? [
          `상속재산: ${formatWon(result.estateWon ?? 0)}원`,
          `원 미만 내림 끝수 (배정하지 않음): ${formatWon(result.remainderWon ?? 0)}원`,
          `합계 (금액 합 + 끝수): ${formatWon(inheritanceAmountTotal(result))}원`,
        ]
      : []),
    `데이터 버전: ${result.dataVersion}`,
    `계산 시각: ${result.computedAt}`,
    "",
    `상속인\t지분(약분)\t약분 전\t백분율(참고)${hasAmount ? "\t금액" : ""}`,
    rows,
    ...(result.warnings && result.warnings.length > 0 ? ["", "경고", ...result.warnings] : []),
    ...(result.trace && result.trace.length > 0 ? ["", "전개식", ...result.trace] : []),
    "",
    STANDARD_DISCLAIMER,
  ].join("\n");
}

export function buildInheritanceLcalcFile(
  input: InheritanceInput,
  calculated: InheritanceResult,
  note: string,
): LcalcFile {
  const payload: LcalcInheritancePayload = {
    appVersion: APP_VERSION,
    dataVersion: calculated.dataVersion,
    createdAt: new Date().toISOString(),
    input,
    result: { ...calculated, disclaimer: STANDARD_DISCLAIMER },
    disclaimer: STANDARD_DISCLAIMER,
  };

  if (note.trim()) {
    payload.note = note.trim();
  }

  return {
    schemaVersion: CURRENT_LCALC_SCHEMA_VERSION,
    kind: "inheritance",
    // 새 의미 필드가 실제로 담긴 파일만 올린다. 구앱이 포기·대습 원인을 버리면 포기자가 지분을
    // 받거나 대습 배우자 슬롯이 되살아나고(@2), 상속재산 금액을 버리면 금액 없는 결과가 된다(@3).
    envelopeFeatures: [inheritanceCapability(input)],
    dataVersions: { inheritance: calculated.dataVersion },
    payload,
  };
}

export function InheritanceCalculator({ active = true }: { active?: boolean }) {
  const [decedent, setDecedent] = useState<DecedentInput>({
    name: "",
    deceasedAt: "2025-01-01",
  });
  const [spouse, setSpouse] = useState<SpouseInput>({ alive: true, name: "" });
  const [linealDescendants, setLinealDescendants] = useState<HeirInput[]>([]);
  const [linealAscendants, setLinealAscendants] = useState<HeirInput[]>([]);
  const [siblings, setSiblings] = useState<HeirInput[]>([]);
  const [collateralFourth, setCollateralFourth] = useState<HeirInput[]>([]);
  const [estateText, setEstateText] = useState("");
  const [note, setNote] = useState("");
  const [loadingAction, setLoadingAction] = useState<ActionName | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dirtySnapshot = useMemo(
    () =>
      buildInheritanceDirtySnapshot({
        decedent,
        spouse,
        linealDescendants,
        linealAscendants,
        siblings,
        collateralFourth,
        estateText,
        note,
      }),
    [
      collateralFourth,
      decedent,
      estateText,
      linealAscendants,
      linealDescendants,
      note,
      siblings,
      spouse,
    ],
  );
  const markInheritanceClean = useLcalcDirtyTracker("inheritance", dirtySnapshot);
  const pristineSnapshotRef = useRef(dirtySnapshot);
  const resultFingerprint = buildInheritanceDirtySnapshot({
    decedent,
    spouse,
    linealDescendants,
    linealAscendants,
    siblings,
    collateralFourth,
    estateText,
    note: "",
  });
  const {
    value: result,
    setValue: setResult,
    setLoaded: setLoadedResult,
    stale: resultStale,
    notice: resultNotice,
  } = useResultFingerprint<InheritanceResult>(resultFingerprint);
  const {
    value: error,
    setValue: setError,
    stale: errorStale,
  } = useResultFingerprint<string>(resultFingerprint);
  const resultReady = result !== null && !resultStale;
  const oldLaw = isOldLawDate(decedent.deceasedAt);

  const buildInput = (): InheritanceInput =>
    withEstate(
      buildInheritanceInput({
        decedent,
        spouse,
        linealDescendants,
        linealAscendants,
        siblings,
        collateralFourth,
      }),
      estateText,
    );

  const applyInput = (input: InheritanceInput) => {
    const groups = applyInheritanceInput(input);
    setDecedent(groups.decedent);
    setSpouse(groups.spouse);
    setLinealDescendants(groups.linealDescendants);
    setLinealAscendants(groups.linealAscendants);
    setSiblings(groups.siblings);
    setCollateralFourth(groups.collateralFourth);
    setEstateText(input.estateWon === undefined ? "" : String(input.estateWon));
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
    const input = buildInput();

    try {
      const r = computeInheritance(input);
      setResult(r);
      setError(null);
      setToast(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReset = () => {
    setDecedent({ name: "", deceasedAt: "2025-01-01" });
    setSpouse({ alive: true, name: "" });
    setLinealDescendants([]);
    setLinealAscendants([]);
    setSiblings([]);
    setCollateralFourth([]);
    setEstateText("");
    setNote("");
    setResult(null);
    setError(null);
    setToast(null);
  };

  const handleExportPdf = () =>
    runAction("pdf", async () => {
      if (!result || resultStale) {
        throw new Error("계산 후 PDF를 저장해 주세요.");
      }
      const path = await ipc.exportInheritancePdf(result);
      return path ? `PDF 파일을 저장했습니다: ${path}` : null;
    });

  const handleExportHwpx = () =>
    runAction("hwpx", async () => {
      if (!result || resultStale) {
        throw new Error("계산 후 HWPX를 저장해 주세요.");
      }
      const path = await ipc.exportHwpx("inheritance", result);
      return path ? `HWPX 파일을 저장했습니다: ${path}` : null;
    });

  const handleExportCsv = () =>
    runAction("csv", async () => {
      if (!result || resultStale) {
        throw new Error("계산 후 CSV를 저장해 주세요.");
      }
      const path = await ipc.exportInheritanceCsv(result);
      return path ? `CSV 파일을 저장했습니다: ${path}` : null;
    });

  const handleCopy = () =>
    runAction("copy", async () => {
      if (!result || resultStale) {
        throw new Error("계산 후 복사해 주세요.");
      }
      await ipc.copyToClipboard(formatInheritanceForClipboard(result));
      return "상속분 계산 결과를 클립보드에 복사했습니다.";
    });

  const handleSaveLcalc = () =>
    runAction("save", async () => {
      if (!result || resultStale) {
        throw new Error("계산 후 .lcalc 파일을 저장해 주세요.");
      }
      const path = await ipc.saveLcalc(buildInheritanceLcalcFile(buildInput(), result, note));
      if (path) {
        markInheritanceClean();
      }
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
    const loaded = parseLoadedInheritanceLcalcInput(migratedFile);
    const loadedNote = loaded.note ?? "";
    applyInput(loaded.input);
    setNote(loadedNote);
    const differs = setLoadedResult(
      loaded.result && { ...loaded.result, disclaimer: STANDARD_DISCLAIMER },
      () => computeInheritance(loaded.input),
      summarizeInheritanceResult,
    );
    setError(null);
    markInheritanceClean(buildLoadedInheritanceDirtySnapshot(loaded.input, loadedNote));
    return differs;
  };

  useCaseSlot("inheritance", {
    collect: () => {
      if (dirtySnapshot === pristineSnapshotRef.current) {
        return { status: "pristine" };
      }
      try {
        const input = buildInput();
        return {
          status: "ok",
          file: buildInheritanceLcalcFile(input, computeInheritance(input), note),
        };
      } catch {
        return { status: "invalid" };
      }
    },
    apply: applyLoadedFile,
    markSaved: () => markInheritanceClean(),
    reset: handleReset,
  });

  const handleLoadLcalc = () =>
    runAction("load", async () => {
      const file = await ipc.loadLcalc();
      if (!file) {
        return "불러오기를 취소했습니다.";
      }

      applyLoadedFile(file);
      return ".lcalc 파일을 불러왔습니다.";
    });

  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 content-start items-start gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[520px_minmax(0,1fr)]">
      <div className="grid gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">피상속인</CardTitle>
            <p className="text-xs text-muted-foreground">
              1991-01-01 이후 사망은 현행 민법, 1960-01-01 ~ 1990-12-31 사망은 사망 당시 구 민법으로
              계산합니다. 1960년 전 사망(관습법)은 계산하지 않습니다.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <label className="grid gap-2 text-sm font-medium">
              이름 (선택)
              <Input
                placeholder="예: 피상속인"
                value={decedent.name}
                onChange={(e) => setDecedent({ ...decedent, name: e.target.value })}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              사망일
              <Input
                type="date"
                value={decedent.deceasedAt}
                onChange={(e) => setDecedent({ ...decedent, deceasedAt: e.target.value })}
              />
            </label>
          </CardContent>
        </Card>

        {oldLaw && !result?.dataVersion.startsWith("inheritance-pre1991") ? (
          <Notice tone="info">
            1991-01-01 전 사망은 구 민법으로 계산합니다. 확인할 점은 계산 결과와 함께 안내합니다.
          </Notice>
        ) : null}

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">배우자</CardTitle>
            <p className="text-xs text-muted-foreground">
              1·2순위 상속인과 같은 순위로 공동상속합니다 (민법 제1003조). 배우자는 한 명만 입력할
              수 있습니다.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={spouse.alive}
                onChange={(e) => setSpouse({ ...spouse, alive: e.target.checked })}
              />
              배우자 생존
            </label>
            {spouse.alive && oldLaw ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                피상속인과의 관계
                <select
                  aria-label="배우자 관계"
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
                  value={spouse.relation ?? ""}
                  onChange={(e) =>
                    setSpouse({
                      ...spouse,
                      relation: (e.target.value || undefined) as SpouseInput["relation"],
                    })
                  }
                >
                  <option value="">선택</option>
                  <option value="wife">처 (피상속인이 남자)</option>
                  <option value="husband">남편 (피상속인이 여자, 구 민법 제1002조)</option>
                </select>
              </label>
            ) : null}
            {spouse.alive ? (
              <label className="grid gap-2 text-sm font-medium">
                이름 (선택)
                <Input
                  placeholder="예: 배우자"
                  value={spouse.name}
                  onChange={(e) => setSpouse({ ...spouse, name: e.target.value })}
                />
              </label>
            ) : null}
          </CardContent>
        </Card>

        <HeirGroupCard
          title="1순위 직계비속"
          hint={HEIR_GROUP_HINTS.linealDescendants}
          heirs={linealDescendants}
          onChange={setLinealDescendants}
          allowRepresentation={true}
          defaultLabel="자녀"
          oldLaw={oldLaw}
          allowHoju={true}
        />

        <HeirGroupCard
          title="2순위 직계존속"
          hint={HEIR_GROUP_HINTS.linealAscendants}
          heirs={linealAscendants}
          onChange={setLinealAscendants}
          allowRepresentation={false}
          defaultLabel="직계존속"
          oldLaw={oldLaw}
          degreeOptions={[
            { value: 1, label: "부모 (1촌)" },
            { value: 2, label: "조부모 (2촌)" },
            { value: 3, label: "증조부모 (3촌)" },
          ]}
        />

        <HeirGroupCard
          title="3순위 형제자매"
          hint={HEIR_GROUP_HINTS.siblings}
          heirs={siblings}
          onChange={setSiblings}
          allowRepresentation={true}
          defaultLabel="형제자매"
          oldLaw={oldLaw}
        />

        <HeirGroupCard
          title={oldLaw ? "4순위 8촌 이내 방계혈족 (구법)" : "4순위 4촌 이내 방계혈족"}
          hint={HEIR_GROUP_HINTS.collaterals}
          heirs={collateralFourth}
          onChange={setCollateralFourth}
          allowRepresentation={false}
          defaultLabel="방계혈족"
          oldLaw={oldLaw}
          degreeOptions={(oldLaw ? [3, 4, 5, 6, 7, 8] : [3, 4]).map((value) => ({
            value,
            label: `${value}촌`,
          }))}
        />

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">상속재산 (선택)</CardTitle>
            <p className="text-xs text-muted-foreground">
              입력하면 상속인별 금액(원 미만 내림)과 배정하지 않은 끝수를 함께 보여 줍니다.
              기여분·특별수익은 반영하지 않은 법정상속분 기준입니다.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <label className="grid gap-2 text-sm font-medium">
              상속재산 금액 (원)
              <Input
                inputMode="numeric"
                placeholder="예: 100,000,000"
                value={formatWonInput(estateText)}
                onChange={(e) => setEstateText(parseWonText(e.target.value))}
              />
            </label>
          </CardContent>
        </Card>

        <label className="grid gap-2 text-sm font-medium">
          비고
          <textarea
            aria-label="상속분 계산 비고"
            className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="예: 가족관계등록부 기준 확인 필요"
            value={note}
            onChange={(event) => setNote(event.target.value)}
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
      </div>

      <div className="result-column grid gap-4">
        {error && !errorStale ? <Notice tone="error">{error}</Notice> : null}

        <ResultFreshnessNotice stale={resultStale} notice={resultNotice} />

        {result ? (
          <>
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm text-muted-foreground">최종 상속 지분</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">상속인</th>
                      <th className="py-2 text-right font-medium">지분 (약분)</th>
                      <th className="py-2 text-right font-medium">약분 전</th>
                      <th className="py-2 font-medium text-right">백분율 (참고)</th>
                      {result.estateWon !== undefined ? (
                        <th className="py-2 font-medium text-right">금액</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {result.shares.map((s, i) => (
                      <tr key={`${s.name}-${i}`} className="border-b border-border last:border-b-0">
                        <td className="py-2">{s.name}</td>
                        <td className="num py-2 pl-3 font-semibold">
                          {s.numerator}/{s.denominator}
                        </td>
                        <td className="num py-2 pl-3 text-xs text-muted-foreground">
                          {s.rawNumerator}/{s.rawDenominator}
                        </td>
                        <td className="num py-2 pl-3 text-xs text-muted-foreground">
                          {formatPercent(s.numerator, s.denominator)}
                        </td>
                        {result.estateWon !== undefined ? (
                          <td className="num py-2 pl-3">{formatWon(s.amountWon ?? 0)}원</td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                  {result.estateWon !== undefined ? (
                    <tfoot className="text-xs text-muted-foreground">
                      <tr>
                        <td className="pt-2" colSpan={4}>
                          원 미만 내림 끝수 (배정하지 않음)
                        </td>
                        <td className="num pt-2 pl-3">{formatWon(result.remainderWon ?? 0)}원</td>
                      </tr>
                      <tr>
                        <td className="font-medium text-foreground" colSpan={4}>
                          합계 (금액 합 + 끝수 = 상속재산)
                        </td>
                        <td
                          className="num pl-3 font-medium text-foreground"
                          data-testid="inheritance-estate-total"
                        >
                          {formatWon(inheritanceAmountTotal(result))}원
                        </td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </CardContent>
            </Card>

            {result.trace && result.trace.length > 0 ? (
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm text-muted-foreground">전개식</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <ol
                    className="grid list-decimal gap-1 pl-5 text-xs"
                    data-testid="inheritance-trace"
                  >
                    {result.trace.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardContent className="grid gap-2 p-4 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-foreground">데이터 버전</dt>
                  <dd>{result.dataVersion}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">계산 시각</dt>
                  <dd>{formatComputedAt(result.computedAt)}</dd>
                </div>
                {result.decedent.name ? (
                  <div>
                    <dt className="font-medium text-foreground">피상속인</dt>
                    <dd>{result.decedent.name}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="font-medium text-foreground">사망일</dt>
                  <dd>{result.decedent.deceasedAt}</dd>
                </div>
              </CardContent>
            </Card>

            {result.dataVersion.startsWith("inheritance-pre1991") ? <OldLawCaution /> : null}
            {result.warnings && result.warnings.length > 0 ? (
              <Notice tone="warn" testId="inheritance-warnings">
                <ul className="grid gap-1">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}

            <Notice tone="info">
              <span>{result.disclaimer || STANDARD_DISCLAIMER}</span>
            </Notice>
          </>
        ) : null}

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">내보내기</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                action="copy"
                icon={Clipboard}
                label="복사"
                loadingAction={loadingAction}
                requiresResult={true}
                resultReady={resultReady}
                onClick={handleCopy}
              />
              <ActionButton
                action="pdf"
                icon={FileDown}
                label="PDF"
                loadingAction={loadingAction}
                requiresResult={true}
                resultReady={resultReady}
                onClick={handleExportPdf}
              />
              <ActionButton
                action="hwpx"
                icon={FileDown}
                label="HWPX 저장"
                loadingAction={loadingAction}
                requiresResult={true}
                resultReady={resultReady}
                onClick={handleExportHwpx}
              />
              <ActionButton
                action="csv"
                icon={FileSpreadsheet}
                label="CSV"
                loadingAction={loadingAction}
                requiresResult={true}
                resultReady={resultReady}
                onClick={handleExportCsv}
              />
              <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
              <ActionButton
                action="save"
                icon={FileJson}
                label=".lcalc 저장"
                loadingAction={loadingAction}
                requiresResult={true}
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
                좌측에서 피상속인 사망일과 상속인 그룹을 입력한 후{" "}
                <span className="font-medium text-foreground">계산</span> 버튼을 누르세요.
              </p>
              <p className="text-xs">
                근거: 민법 제1000·1001·1003·1009·1010조. 이 버전은 1차 대습까지만 계산하고, 2차 이상
                대습은 계산하지 않습니다.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

/** 구법 사건 경고. 결과부에만 띄운다(입력부는 회색 한 줄). */
function OldLawCaution() {
  return (
    <Notice tone="warn">
      <strong>구법 사건은 전문가 확인이 필요합니다.</strong>
      <span className="text-xs">
        1991-01-01 전 사망은 사망 당시 구 민법(1960~1978 제정 민법, 1979~1990 1977 개정 민법)의
        호주상속 가산, 여자·출가녀 상속분, 처의 상속분으로 계산합니다. 호적(가적)·혼인·호주상속
        사실관계에 따라 결과가 달라지며, 대습 호주상속·상속포기·처나 직계존속의 호주상속은 계산하지
        않습니다.
      </span>
    </Notice>
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
