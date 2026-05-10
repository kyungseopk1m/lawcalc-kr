import {
  CheckCircle2,
  Clipboard,
  FileDown,
  FileJson,
  FileSpreadsheet,
  Loader2,
  Plus,
  Trash2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  STANDARD_DISCLAIMER,
  calculateInheritance,
  type HeirNode,
  type InheritanceInput,
  type InheritanceResult,
} from "@lawcalc-kr/core-engine";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { ipc, type LcalcFile, type LcalcInheritancePayload } from "../lib/ipc";
import { createLcalcDirtySnapshot, useLcalcDirtyTracker } from "../lib/lcalc-dirty-state";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "../lib/lcalc-migrations";
import { parseLoadedInheritanceLcalcInput, validateLcalcEnvelope } from "../lib/lcalc-validation";

interface HeirInput {
  id: string;
  name: string;
  deceasedBeforeOpening: boolean;
  representatives: { id: string; name: string }[];
}

interface SpouseInput {
  alive: boolean;
  name: string;
}

interface DecedentInput {
  name: string;
  deceasedAt: string;
}

const APP_VERSION = "0.2.4";

type ActionName = "pdf" | "csv" | "copy" | "save" | "load";

interface ToastState {
  type: "success" | "error";
  message: string;
}

function newId(): string {
  return crypto.randomUUID();
}

function emptyHeir(): HeirInput {
  return { id: newId(), name: "", deceasedBeforeOpening: false, representatives: [] };
}

function toHeirNode(h: HeirInput, allowRepresentation: boolean): HeirNode {
  const node: HeirNode = {
    deceasedBeforeOpening: h.deceasedBeforeOpening,
  };
  const name = h.name.trim();
  if (name) {
    node.name = name;
  }
  if (allowRepresentation && h.deceasedBeforeOpening && h.representatives.length > 0) {
    node.representatives = h.representatives.map((r) => {
      const representative: HeirNode = { deceasedBeforeOpening: false };
      const representativeName = r.name.trim();
      if (representativeName) {
        representative.name = representativeName;
      }
      return representative;
    });
  }
  return node;
}

function fromHeirNode(h: HeirNode): HeirInput {
  return {
    id: newId(),
    name: h.name ?? "",
    deceasedBeforeOpening: h.deceasedBeforeOpening,
    representatives:
      h.representatives?.map((representative) => ({
        id: newId(),
        name: representative.name ?? "",
      })) ?? [],
  };
}

function heirsForDirtySnapshot(heirs: HeirInput[]) {
  return heirs.map((heir) => ({
    name: heir.name,
    deceasedBeforeOpening: heir.deceasedBeforeOpening,
    representatives: heir.representatives.map((representative) => ({
      name: representative.name,
    })),
  }));
}

function heirsFromNodesForDirtySnapshot(heirs: HeirNode[] | undefined) {
  return (
    heirs?.map((heir) => ({
      name: heir.name ?? "",
      deceasedBeforeOpening: heir.deceasedBeforeOpening,
      representatives:
        heir.representatives?.map((representative) => ({
          name: representative.name ?? "",
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
  note,
}: {
  decedent: DecedentInput;
  spouse: SpouseInput;
  linealDescendants: HeirInput[];
  linealAscendants: HeirInput[];
  siblings: HeirInput[];
  collateralFourth: HeirInput[];
  note: string;
}) {
  return createLcalcDirtySnapshot({
    decedent,
    spouse,
    linealDescendants: heirsForDirtySnapshot(linealDescendants),
    linealAscendants: heirsForDirtySnapshot(linealAscendants),
    siblings: heirsForDirtySnapshot(siblings),
    collateralFourth: heirsForDirtySnapshot(collateralFourth),
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
    },
    linealDescendants: heirsFromNodesForDirtySnapshot(input.linealDescendants),
    linealAscendants: heirsFromNodesForDirtySnapshot(input.linealAscendants),
    siblings: heirsFromNodesForDirtySnapshot(input.siblings),
    collateralFourth: heirsFromNodesForDirtySnapshot(input.collateralFourth),
    note,
  });
}

interface HeirGroupCardProps {
  title: string;
  hint: string;
  heirs: HeirInput[];
  onChange: (heirs: HeirInput[]) => void;
  allowRepresentation: boolean;
  defaultLabel: string;
}

function HeirGroupCard({
  title,
  hint,
  heirs,
  onChange,
  allowRepresentation,
  defaultLabel,
}: HeirGroupCardProps) {
  const update = (idx: number, patch: Partial<HeirInput>) => {
    onChange(heirs.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  };
  const remove = (idx: number) => {
    onChange(heirs.filter((_, i) => i !== idx));
  };
  const addRep = (idx: number) => {
    onChange(
      heirs.map((h, i) =>
        i === idx
          ? { ...h, representatives: [...h.representatives, { id: newId(), name: "" }] }
          : h,
      ),
    );
  };
  const updateRep = (idx: number, repIdx: number, name: string) => {
    onChange(
      heirs.map((h, i) =>
        i === idx
          ? {
              ...h,
              representatives: h.representatives.map((r, j) => (j === repIdx ? { ...r, name } : r)),
            }
          : h,
      ),
    );
  };
  const removeRep = (idx: number, repIdx: number) => {
    onChange(
      heirs.map((h, i) =>
        i === idx ? { ...h, representatives: h.representatives.filter((_, j) => j !== repIdx) } : h,
      ),
    );
  };

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-0">
        {heirs.map((h, idx) => (
          <div key={h.id} className="grid gap-2 rounded-md border border-input p-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder={`예: ${defaultLabel}${idx + 1}`}
                value={h.name}
                onChange={(e) => update(idx, { name: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="삭제"
                onClick={() => remove(idx)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={h.deceasedBeforeOpening}
                onChange={(e) =>
                  update(idx, {
                    deceasedBeforeOpening: e.target.checked,
                    representatives: e.target.checked ? h.representatives : [],
                  })
                }
              />
              상속개시 전 사망 (또는 결격)
            </label>
            {allowRepresentation && h.deceasedBeforeOpening ? (
              <div className="grid gap-2 border-t border-border pt-2">
                <p className="text-xs font-medium text-foreground">대습상속인 (1차)</p>
                {h.representatives.map((r, repIdx) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <Input
                      placeholder={`예: ${h.name || `${defaultLabel}${idx + 1}`}의 대습${repIdx + 1}`}
                      value={r.name}
                      onChange={(e) => updateRep(idx, repIdx, e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="대습 삭제"
                      onClick={() => removeRep(idx, repIdx)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addRep(idx)}
                  type="button"
                  className="w-fit"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  대습 추가
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...heirs, emptyHeir()])}
          type="button"
          className="w-fit"
        >
          <Plus className="mr-1 h-3 w-3" />
          {defaultLabel} 추가
        </Button>
      </CardContent>
    </Card>
  );
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

function formatInheritanceForClipboard(result: InheritanceResult): string {
  const rows = result.shares
    .map(
      (share) =>
        `${share.name}\t${share.numerator}/${share.denominator}\t${share.rawNumerator}/${share.rawDenominator}\t${formatPercent(
          share.numerator,
          share.denominator,
        )}`,
    )
    .join("\n");

  return [
    "LawCalc Korea 상속분 간이 계산 결과",
    `피상속인: ${result.decedent.name ?? "-"}`,
    `사망일: ${result.decedent.deceasedAt}`,
    `데이터 버전: ${result.dataVersion}`,
    `계산 시각: ${result.computedAt}`,
    "",
    "상속인\t지분(약분)\t약분 전\t백분율(참고)",
    rows,
    "",
    STANDARD_DISCLAIMER,
  ].join("\n");
}

export function InheritanceCalculator() {
  const [decedent, setDecedent] = useState<DecedentInput>({
    name: "",
    deceasedAt: "2025-01-01",
  });
  const [spouse, setSpouse] = useState<SpouseInput>({ alive: true, name: "" });
  const [linealDescendants, setLinealDescendants] = useState<HeirInput[]>([]);
  const [linealAscendants, setLinealAscendants] = useState<HeirInput[]>([]);
  const [siblings, setSiblings] = useState<HeirInput[]>([]);
  const [collateralFourth, setCollateralFourth] = useState<HeirInput[]>([]);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<InheritanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        note,
      }),
    [collateralFourth, decedent, linealAscendants, linealDescendants, note, siblings, spouse],
  );
  const markInheritanceClean = useLcalcDirtyTracker("inheritance", dirtySnapshot);

  const buildInput = (): InheritanceInput => ({
    decedent: decedent.name.trim()
      ? { name: decedent.name.trim(), deceasedAt: decedent.deceasedAt }
      : { deceasedAt: decedent.deceasedAt },
    ...(spouse.alive
      ? {
          spouse: spouse.name.trim() ? { name: spouse.name.trim(), alive: true } : { alive: true },
        }
      : {}),
    ...(linealDescendants.length > 0
      ? { linealDescendants: linealDescendants.map((h) => toHeirNode(h, true)) }
      : {}),
    ...(linealAscendants.length > 0
      ? { linealAscendants: linealAscendants.map((h) => toHeirNode(h, false)) }
      : {}),
    ...(siblings.length > 0 ? { siblings: siblings.map((h) => toHeirNode(h, true)) } : {}),
    ...(collateralFourth.length > 0
      ? { collateralFourth: collateralFourth.map((h) => toHeirNode(h, false)) }
      : {}),
  });

  const applyInput = (input: InheritanceInput) => {
    setDecedent({
      name: input.decedent.name ?? "",
      deceasedAt: input.decedent.deceasedAt,
    });
    setSpouse({
      alive: input.spouse?.alive ?? false,
      name: input.spouse?.name ?? "",
    });
    setLinealDescendants(input.linealDescendants?.map(fromHeirNode) ?? []);
    setLinealAscendants(input.linealAscendants?.map(fromHeirNode) ?? []);
    setSiblings(input.siblings?.map(fromHeirNode) ?? []);
    setCollateralFourth(input.collateralFourth?.map(fromHeirNode) ?? []);
  };

  const buildLcalcFile = (input: InheritanceInput, calculated: InheritanceResult): LcalcFile => {
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
      payload,
    };
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
      const r = calculateInheritance(input);
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
    setNote("");
    setResult(null);
    setError(null);
    setToast(null);
  };

  const handleExportPdf = () =>
    runAction("pdf", async () => {
      if (!result) {
        throw new Error("계산 후 PDF를 저장해 주세요.");
      }
      const path = await ipc.exportInheritancePdf(result);
      return path ? `PDF 파일을 저장했습니다: ${path}` : null;
    });

  const handleExportCsv = () =>
    runAction("csv", async () => {
      if (!result) {
        throw new Error("계산 후 CSV를 저장해 주세요.");
      }
      const path = await ipc.exportInheritanceCsv(result);
      return path ? `CSV 파일을 저장했습니다: ${path}` : null;
    });

  const handleCopy = () =>
    runAction("copy", async () => {
      if (!result) {
        throw new Error("계산 후 복사해 주세요.");
      }
      await ipc.copyToClipboard(formatInheritanceForClipboard(result));
      return "상속분 계산 결과를 클립보드에 복사했습니다.";
    });

  const handleSaveLcalc = () =>
    runAction("save", async () => {
      if (!result) {
        throw new Error("계산 후 .lcalc 파일을 저장해 주세요.");
      }
      const path = await ipc.saveLcalc(buildLcalcFile(buildInput(), result));
      if (path) {
        markInheritanceClean();
      }
      return path ? `.lcalc 파일을 저장했습니다: ${path}` : "저장을 취소했습니다.";
    });

  const handleLoadLcalc = () =>
    runAction("load", async () => {
      const file = await ipc.loadLcalc();
      if (!file) {
        return "불러오기를 취소했습니다.";
      }

      const migratedFile = migrateLcalcFile(file);
      validateLcalcEnvelope(migratedFile);
      const loaded = parseLoadedInheritanceLcalcInput(migratedFile);
      const loadedNote = loaded.note ?? "";
      applyInput(loaded.input);
      setNote(loadedNote);
      const loadedResult = loaded.result ?? calculateInheritance(loaded.input);
      setResult({ ...loadedResult, disclaimer: STANDARD_DISCLAIMER });
      setError(null);
      markInheritanceClean(buildLoadedInheritanceDirtySnapshot(loaded.input, loadedNote));
      return ".lcalc 파일을 불러왔습니다.";
    });

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[580px_minmax(0,1fr)]">
      <div className="grid gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">피상속인</CardTitle>
            <p className="text-xs text-muted-foreground">
              1991-01-01 이후 사망 케이스만 지원합니다 (1990 개정민법 시행).
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

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">배우자</CardTitle>
            <p className="text-xs text-muted-foreground">
              1·2순위와 동순위 공동 (민법 1003조). 배우자는 한 명 이상 입력할 수 없습니다.
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
          title="1순위 — 직계비속"
          hint="자녀·손자녀 등. 사망 시 그 직계비속 (피상속인의 손자녀) 이 1차 대습."
          heirs={linealDescendants}
          onChange={setLinealDescendants}
          allowRepresentation={true}
          defaultLabel="자녀"
        />

        <HeirGroupCard
          title="2순위 — 직계존속"
          hint="부·모·조부모. 1순위 부재 시에만 분배 참여. 대습상속 대상 아님 (1001조)."
          heirs={linealAscendants}
          onChange={setLinealAscendants}
          allowRepresentation={false}
          defaultLabel="직계존속"
        />

        <HeirGroupCard
          title="3순위 — 형제자매"
          hint="1·2순위·배우자 모두 부재 시에만. 사망 시 그 직계비속 (조카) 이 1차 대습 가능."
          heirs={siblings}
          onChange={setSiblings}
          allowRepresentation={true}
          defaultLabel="형제자매"
        />

        <HeirGroupCard
          title="4순위 — 4촌이내 방계혈족"
          hint="1·2·3순위·배우자 모두 부재 시에만. 대습상속 대상 아님."
          heirs={collateralFourth}
          onChange={setCollateralFourth}
          allowRepresentation={false}
          defaultLabel="방계혈족"
        />

        <div className="flex gap-2">
          <Button onClick={handleCalculate} type="button">
            계산
          </Button>
          <Button onClick={handleReset} variant="outline" type="button">
            초기화
          </Button>
        </div>
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
      </div>

      <div className="grid gap-4">
        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

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
                      <th className="py-2 font-medium">지분 (약분)</th>
                      <th className="py-2 font-medium">약분 전</th>
                      <th className="py-2 font-medium text-right">백분율 (참고)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.shares.map((s, i) => (
                      <tr key={`${s.name}-${i}`} className="border-b border-border last:border-b-0">
                        <td className="py-2">{s.name}</td>
                        <td className="py-2 font-mono">
                          {s.numerator}/{s.denominator}
                        </td>
                        <td className="py-2 font-mono text-xs text-muted-foreground">
                          {s.rawNumerator}/{s.rawDenominator}
                        </td>
                        <td className="py-2 text-right text-xs text-muted-foreground">
                          {formatPercent(s.numerator, s.denominator)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

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

            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
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
                requiresResult={true}
                resultReady={result !== null}
                onClick={handleExportPdf}
              />
              <ActionButton
                action="csv"
                icon={FileSpreadsheet}
                label="CSV"
                loadingAction={loadingAction}
                requiresResult={true}
                resultReady={result !== null}
                onClick={handleExportCsv}
              />
              <ActionButton
                action="copy"
                icon={Clipboard}
                label="복사"
                loadingAction={loadingAction}
                requiresResult={true}
                resultReady={result !== null}
                onClick={handleCopy}
              />
              <ActionButton
                action="save"
                icon={FileJson}
                label=".lcalc 저장"
                loadingAction={loadingAction}
                requiresResult={true}
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
                좌측에서 피상속인 사망일과 상속인 그룹을 입력한 후{" "}
                <span className="font-medium text-foreground">계산</span> 버튼을 누르세요.
              </p>
              <p className="text-xs">
                근거: 민법 제1000·1001·1003·1009·1010조. 본 버전은 1차 대습까지만 지원하며, 2차 이상
                대습은 거부됩니다.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
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
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-700";

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
