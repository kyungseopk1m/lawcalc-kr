import {
  CheckCircle2,
  Clipboard,
  FileJson,
  Loader2,
  Plus,
  Trash2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  APPROPRIATION_DATA_VERSION,
  STANDARD_DISCLAIMER,
  computeAppropriation,
  type AllocationTarget,
  type AppropriationAllocationDirective,
  type AppropriationAllocationType,
  type AppropriationClaimInput,
  type AppropriationInput,
  type AppropriationResult,
} from "@lawcalc-kr/core-engine";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { useFormShortcuts } from "../hooks/use-form-shortcuts";
import { useCaseSlot } from "../lib/case-file";
import { formatWonInput, parseWonAmount, parseWonText } from "../lib/format-won";
import { ipc, type LcalcAppropriationPayload, type LcalcFile } from "../lib/ipc";
import { createLcalcDirtySnapshot, useLcalcDirtyTracker } from "../lib/lcalc-dirty-state";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "../lib/lcalc-migrations";
import { parseLoadedAppropriationLcalcInput, validateLcalcEnvelope } from "../lib/lcalc-validation";

const APP_VERSION = __APP_VERSION__;

type ActionName = "copy" | "save" | "load";

interface ToastState {
  type: "success" | "error";
  message: string;
}

export interface ClaimInputState {
  uid: string;
  id: string;
  name: string;
  costBalanceText: string;
  interestBalanceText: string;
  principalBalanceText: string;
  dueAt: string;
  debtorBenefitRankText: string;
}

export interface TargetInputState {
  uid: string;
  claimId: string;
  amountText: string;
}

export interface PaymentInputState {
  amountText: string;
  allocationType: AppropriationAllocationType;
  targets: TargetInputState[];
}

function newUid(): string {
  return crypto.randomUUID();
}

function emptyClaim(): ClaimInputState {
  return {
    uid: newUid(),
    id: "",
    name: "",
    costBalanceText: "",
    interestBalanceText: "",
    principalBalanceText: "",
    dueAt: "2025-01-01",
    debtorBenefitRankText: "",
  };
}

function emptyTarget(claimId = ""): TargetInputState {
  return { uid: newUid(), claimId, amountText: "" };
}

export function buildAppropriationInput(
  claims: ClaimInputState[],
  payment: PaymentInputState,
  computedAt?: string,
): AppropriationInput {
  const claimInputs: AppropriationClaimInput[] = claims.map((claim) => {
    const base: AppropriationClaimInput = {
      id: claim.id.trim(),
      principalBalance: parseWonAmount(claim.principalBalanceText, 0),
      dueAt: claim.dueAt,
    };
    const name = claim.name.trim();
    if (name) base.name = name;
    const cost = parseWonAmount(claim.costBalanceText, 0);
    if (cost > 0) base.costBalance = cost;
    const interest = parseWonAmount(claim.interestBalanceText, 0);
    if (interest > 0) base.interestBalance = interest;
    const rankRaw = parseWonText(claim.debtorBenefitRankText);
    if (rankRaw.length > 0) base.debtorBenefitRank = Number(rankRaw);
    return base;
  });

  const amount = parseWonAmount(payment.amountText, 0);
  let allocation: AppropriationAllocationDirective;
  if (payment.allocationType === "legal") {
    allocation = { type: "legal" };
  } else {
    const targets: AllocationTarget[] = payment.targets
      .filter((target) => target.claimId.length > 0 && parseWonAmount(target.amountText, 0) > 0)
      .map((target) => ({
        claimId: target.claimId,
        amount: parseWonAmount(target.amountText, 0),
      }));
    allocation = { type: payment.allocationType, targets };
  }

  const input: AppropriationInput = {
    claims: claimInputs,
    payment: { amount, allocation },
  };
  if (computedAt) input.computedAt = computedAt;
  return input;
}

export function applyLoadedAppropriationInput(input: AppropriationInput): {
  claims: ClaimInputState[];
  payment: PaymentInputState;
} {
  const claims: ClaimInputState[] = input.claims.map((claim) => ({
    uid: newUid(),
    id: claim.id,
    name: claim.name ?? "",
    costBalanceText: claim.costBalance ? String(claim.costBalance) : "",
    interestBalanceText: claim.interestBalance ? String(claim.interestBalance) : "",
    principalBalanceText: String(claim.principalBalance),
    dueAt: claim.dueAt,
    debtorBenefitRankText:
      claim.debtorBenefitRank === undefined ? "" : String(claim.debtorBenefitRank),
  }));
  const payment: PaymentInputState = {
    amountText: String(input.payment.amount),
    allocationType: input.payment.allocation.type,
    targets:
      input.payment.allocation.type === "legal"
        ? []
        : input.payment.allocation.targets.map((target) => ({
            uid: newUid(),
            claimId: target.claimId,
            amountText: String(target.amount),
          })),
  };
  return { claims, payment };
}

export function formatAppropriationForClipboard(result: AppropriationResult): string {
  const claimRows = result.claims
    .map(
      (claim) =>
        `${claim.name ?? claim.claimId}\t차감 ${formatWon(claim.totalApplied)}\t잔액 ${formatWon(
          claim.principalBalanceAfter + claim.interestBalanceAfter + claim.costBalanceAfter,
        )}`,
    )
    .join("\n");

  return [
    "LawCalc Korea 변제충당 계산 결과",
    `변제액: ${formatWon(result.payment.amount)} (${result.payment.allocationType})`,
    `충당 합계: ${formatWon(result.payment.appliedAmount)}`,
    `잉여 (반환): ${formatWon(result.payment.unappliedAmount)}`,
    `데이터 버전: ${result.dataVersion}`,
    `계산 시각: ${result.computedAt}`,
    "",
    "채권\t차감액\t잔액",
    claimRows,
    "",
    STANDARD_DISCLAIMER,
  ].join("\n");
}

export function buildAppropriationLcalcFile(
  input: AppropriationInput,
  result: AppropriationResult,
  note: string,
): LcalcFile {
  const payload: LcalcAppropriationPayload = {
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    input,
    result: { ...result, disclaimer: STANDARD_DISCLAIMER },
    disclaimer: STANDARD_DISCLAIMER,
  };
  if (note.trim()) payload.note = note.trim();
  return {
    schemaVersion: CURRENT_LCALC_SCHEMA_VERSION,
    kind: "appropriation",
    envelopeFeatures: ["appropriation@1"],
    dataVersions: { appropriation: result.dataVersion },
    payload,
  };
}

function formatWon(value: number): string {
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}원`;
}

function formatComputedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function claimsForDirtySnapshot(claims: ClaimInputState[]) {
  return claims.map((claim) => ({
    id: claim.id,
    name: claim.name,
    costBalanceText: claim.costBalanceText,
    interestBalanceText: claim.interestBalanceText,
    principalBalanceText: claim.principalBalanceText,
    dueAt: claim.dueAt,
    debtorBenefitRankText: claim.debtorBenefitRankText,
  }));
}

function targetsForDirtySnapshot(targets: TargetInputState[]) {
  return targets.map((target) => ({
    claimId: target.claimId,
    amountText: target.amountText,
  }));
}

function buildAppropriationDirtySnapshot({
  claims,
  payment,
  note,
}: {
  claims: ClaimInputState[];
  payment: PaymentInputState;
  note: string;
}) {
  return createLcalcDirtySnapshot({
    claims: claimsForDirtySnapshot(claims),
    payment: {
      amountText: payment.amountText,
      allocationType: payment.allocationType,
      targets: targetsForDirtySnapshot(payment.targets),
    },
    note,
  });
}

function buildLoadedAppropriationDirtySnapshot(
  applied: { claims: ClaimInputState[]; payment: PaymentInputState },
  note: string,
) {
  return createLcalcDirtySnapshot({
    claims: claimsForDirtySnapshot(applied.claims),
    payment: {
      amountText: applied.payment.amountText,
      allocationType: applied.payment.allocationType,
      targets: targetsForDirtySnapshot(applied.payment.targets),
    },
    note,
  });
}

export function AppropriationCalculator({ active = true }: { active?: boolean }) {
  const [claims, setClaims] = useState<ClaimInputState[]>(() => [
    { ...emptyClaim(), id: "loan-1", name: "대여금A", principalBalanceText: "1000000" },
  ]);
  const [payment, setPayment] = useState<PaymentInputState>(() => ({
    amountText: "500000",
    allocationType: "legal",
    targets: [],
  }));
  const [note, setNote] = useState("");
  const [result, setResult] = useState<AppropriationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<ActionName | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const input = useMemo(() => buildAppropriationInput(claims, payment), [claims, payment]);

  const dirtySnapshot = useMemo(
    () => buildAppropriationDirtySnapshot({ claims, payment, note }),
    [claims, payment, note],
  );
  const markAppropriationClean = useLcalcDirtyTracker("appropriation", dirtySnapshot);
  const pristineSnapshotRef = useRef(dirtySnapshot);

  const handleCalculate = () => {
    try {
      const calculated = computeAppropriation(input);
      setResult(calculated);
      setError(null);
      setToast(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReset = () => {
    setClaims([
      { ...emptyClaim(), id: "loan-1", name: "대여금A", principalBalanceText: "1000000" },
    ]);
    setPayment({ amountText: "500000", allocationType: "legal", targets: [] });
    setNote("");
    setResult(null);
    setError(null);
    setToast(null);
  };

  const addClaim = () => {
    setClaims((prev) => [...prev, { ...emptyClaim(), id: `loan-${prev.length + 1}` }]);
  };

  const removeClaim = (uid: string) => {
    setClaims((prev) => prev.filter((c) => c.uid !== uid));
  };

  const updateClaim = (uid: string, patch: Partial<ClaimInputState>) => {
    setClaims((prev) => prev.map((c) => (c.uid === uid ? { ...c, ...patch } : c)));
  };

  const updatePayment = (patch: Partial<PaymentInputState>) => {
    setPayment((prev) => ({ ...prev, ...patch }));
  };

  const addTarget = () => {
    setPayment((prev) => ({
      ...prev,
      targets: [...prev.targets, emptyTarget(claims[0]?.id ?? "")],
    }));
  };

  const removeTarget = (uid: string) => {
    setPayment((prev) => ({
      ...prev,
      targets: prev.targets.filter((t) => t.uid !== uid),
    }));
  };

  const updateTarget = (uid: string, patch: Partial<TargetInputState>) => {
    setPayment((prev) => ({
      ...prev,
      targets: prev.targets.map((t) => (t.uid === uid ? { ...t, ...patch } : t)),
    }));
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
      await ipc.copyToClipboard(formatAppropriationForClipboard(result));
      return "변제충당 계산 결과를 클립보드에 복사했습니다.";
    });

  const handleSaveLcalc = () =>
    runAction("save", async () => {
      if (!result) throw new Error("계산 후 .lcalc 파일을 저장해 주세요.");
      const path = await ipc.saveLcalc(buildAppropriationLcalcFile(input, result, note));
      if (path) {
        markAppropriationClean();
      }
      return path ? `.lcalc 파일을 저장했습니다: ${path}` : "저장을 취소했습니다.";
    });

  const applyLoadedFile = (file: unknown) => {
    const migratedFile = migrateLcalcFile(file);
    validateLcalcEnvelope(migratedFile);
    const loaded = parseLoadedAppropriationLcalcInput(migratedFile);
    const applied = applyLoadedAppropriationInput(loaded.input);
    const loadedNote = loaded.note ?? "";
    setClaims(applied.claims);
    setPayment(applied.payment);
    setNote(loadedNote);
    setResult(loaded.result ?? computeAppropriation(loaded.input));
    setError(null);
    markAppropriationClean(buildLoadedAppropriationDirtySnapshot(applied, loadedNote));
  };

  useCaseSlot("appropriation", {
    collect: () => {
      if (dirtySnapshot === pristineSnapshotRef.current) {
        return { status: "pristine" };
      }
      try {
        return {
          status: "ok",
          file: buildAppropriationLcalcFile(input, computeAppropriation(input), note),
        };
      } catch {
        return { status: "invalid" };
      }
    },
    apply: applyLoadedFile,
    markSaved: () => markAppropriationClean(),
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
            <CardTitle className="text-sm">채권 (변제 대상)</CardTitle>
            <p className="text-xs text-muted-foreground">
              민법 제476조 (지정충당) / 제477조 (법정충당) / 제479조 (비용·이자·원본 순) 적용.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            {claims.map((claim) => (
              <div key={claim.uid} className="grid gap-2 rounded-md border border-input p-3">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="채권 ID (예: loan-1)"
                    value={claim.id}
                    onChange={(e) => updateClaim(claim.uid, { id: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="채권 삭제"
                    onClick={() => removeClaim(claim.uid)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  placeholder="채권명 (선택, 예: 대여금A)"
                  value={claim.name}
                  onChange={(e) => updateClaim(claim.uid, { name: e.target.value })}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    inputMode="numeric"
                    placeholder="비용 잔액"
                    value={formatWonInput(claim.costBalanceText)}
                    onChange={(e) =>
                      updateClaim(claim.uid, { costBalanceText: parseWonText(e.target.value) })
                    }
                  />
                  <Input
                    inputMode="numeric"
                    placeholder="이자 잔액"
                    value={formatWonInput(claim.interestBalanceText)}
                    onChange={(e) =>
                      updateClaim(claim.uid, { interestBalanceText: parseWonText(e.target.value) })
                    }
                  />
                  <Input
                    inputMode="numeric"
                    placeholder="원본 잔액"
                    value={formatWonInput(claim.principalBalanceText)}
                    onChange={(e) =>
                      updateClaim(claim.uid, { principalBalanceText: parseWonText(e.target.value) })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs">
                    이행기
                    <Input
                      type="date"
                      value={claim.dueAt}
                      onChange={(e) => updateClaim(claim.uid, { dueAt: e.target.value })}
                    />
                  </label>
                  <label className="grid gap-1 text-xs">
                    변제이익 순위 (낮을수록 우선)
                    <Input
                      inputMode="numeric"
                      placeholder="0"
                      value={claim.debtorBenefitRankText}
                      onChange={(e) =>
                        updateClaim(claim.uid, {
                          debtorBenefitRankText: parseWonText(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addClaim} type="button" className="w-fit">
              <Plus className="mr-1 h-3 w-3" />
              채권 추가
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">변제 정보</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <label className="grid gap-2 text-sm font-medium">
              변제 금액
              <Input
                inputMode="numeric"
                placeholder="예: 500,000"
                value={formatWonInput(payment.amountText)}
                onChange={(e) => updatePayment({ amountText: parseWonText(e.target.value) })}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              충당 방식
              <Select
                value={payment.allocationType}
                onChange={(e) =>
                  updatePayment({
                    allocationType: e.target.value as AppropriationAllocationType,
                    targets: e.target.value === "legal" ? [] : payment.targets,
                  })
                }
              >
                <option value="legal">법정충당 (477조)</option>
                <option value="agreement">합의 (1순위)</option>
                <option value="debtorDesignation">채무자 지정 (476조 2순위)</option>
                <option value="creditorDesignation">채권자 지정 (476조 3순위)</option>
              </Select>
              <span className="text-xs font-normal text-muted-foreground">
                충당 방법은 합의 → 지정(채무자·채권자) → 법정 순으로 우선합니다.
              </span>
            </label>
            {payment.allocationType !== "legal" ? (
              <div className="grid gap-2">
                <div className="text-xs font-medium text-muted-foreground">충당 대상</div>
                {payment.targets.map((target) => (
                  <div
                    key={target.uid}
                    className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
                  >
                    <Select
                      value={target.claimId}
                      onChange={(e) => updateTarget(target.uid, { claimId: e.target.value })}
                    >
                      <option value="">채권 선택</option>
                      {claims.map((c) => (
                        <option key={c.uid} value={c.id}>
                          {c.id} {c.name ? `(${c.name})` : ""}
                        </option>
                      ))}
                    </Select>
                    <Input
                      inputMode="numeric"
                      placeholder="금액"
                      value={formatWonInput(target.amountText)}
                      onChange={(e) =>
                        updateTarget(target.uid, { amountText: parseWonText(e.target.value) })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="충당 대상 삭제"
                      onClick={() => removeTarget(target.uid)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addTarget}
                  type="button"
                  className="w-fit"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  대상 추가
                </Button>
              </div>
            ) : null}
            <label className="grid gap-2 text-sm font-medium">
              비고
              <textarea
                aria-label="변제충당 비고"
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
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">변제액</span>
                  <span className="text-right">{formatWon(result.payment.amount)}</span>
                  <span className="text-muted-foreground">충당 합계</span>
                  <span className="text-right">{formatWon(result.payment.appliedAmount)}</span>
                  <span className="text-muted-foreground">잉여 (반환)</span>
                  <span className="text-right">{formatWon(result.payment.unappliedAmount)}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">채권</th>
                      <th className="py-2 text-right font-medium">차감 (비용/이자/원본)</th>
                      <th className="py-2 text-right font-medium">잔액 (원본)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.claims.map((claim) => (
                      <tr key={claim.claimId} className="border-b border-border last:border-b-0">
                        <td className="py-2">{claim.name ?? claim.claimId}</td>
                        <td className="py-2 text-right text-xs">
                          {formatWon(claim.costApplied)} / {formatWon(claim.interestApplied)} /{" "}
                          {formatWon(claim.principalApplied)}
                        </td>
                        <td className="py-2 text-right">
                          {formatWon(claim.principalBalanceAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="grid gap-1 text-xs text-muted-foreground">
                  <span>데이터 버전: {result.dataVersion}</span>
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
                좌측에서 채권 잔액과 변제 정보를 입력한 후{" "}
                <span className="font-medium text-foreground">계산</span> 버튼을 누르세요.
              </p>
              <p className="text-xs">
                근거: 민법 제476조 (지정충당) / 477조 (법정충당) / 479조 (비용·이자·원본 순). 본
                도메인은 v0.4 사이클에서 도입된 초기 범위입니다. 단일 변제 이벤트와 여러 채권의 잔액
                분배만 지원하며, 이자 누적과 이자제한법 제한이율 검토는 후속 버전 범위입니다.
              </p>
              <p className="text-xs">데이터 버전: {APPROPRIATION_DATA_VERSION}</p>
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
