import {
  CheckCircle2,
  Clipboard,
  FileJson,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Trash2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useMemo, useRef, useState } from "react";

import {
  STANDARD_DISCLAIMER,
  computeAppropriation,
  isExtendedAppropriationInput,
  type AllocationTarget,
  type AppropriationAllocationDirective,
  type AppropriationAllocationType,
  type AppropriationClaimInput,
  type AppropriationInput,
  type AppropriationPaymentInput,
  type AppropriationResult,
} from "@lawcalc-kr/core-engine";

import { ResultFreshnessNotice } from "../components/result/ResultFreshnessNotice";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { useFormShortcuts } from "../hooks/use-form-shortcuts";
import { useResultFingerprint } from "../hooks/use-result-fingerprint";
import { useCaseSlot } from "../lib/case-file";
import { formatWon, formatWonInput, parseWonAmount, parseWonText } from "../lib/format-won";
import {
  ipc,
  type AppropriationExportView,
  type LcalcAppropriationPayload,
  type LcalcFile,
} from "../lib/ipc";
import { createLcalcDirtySnapshot, useLcalcDirtyTracker } from "../lib/lcalc-dirty-state";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "../lib/lcalc-migrations";
import { parseLoadedAppropriationLcalcInput, validateLcalcEnvelope } from "../lib/lcalc-validation";

const APP_VERSION = __APP_VERSION__;

type ActionName = "copy" | "pdf" | "hwpx" | "csv" | "save" | "load";

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
  /** 약정 연이율(%) 텍스트. 비우면 이자를 붙이지 않는다. */
  interestRateText?: string;
  /** 이자 기산일 (포함). */
  interestFrom?: string;
  /** 이자제한법 적용 (금전대차). */
  limitEnabled?: boolean;
  /** 약정일 (이자제한법 제2조 제2항). */
  limitAgreedAt?: string;
  /** 사전공제한 선이자 (이자제한법 제3조). */
  prepaidText?: string;
}

export interface TargetInputState {
  uid: string;
  claimId: string;
  amountText: string;
}

export interface PaymentInputState {
  amountText: string;
  allocationType: AppropriationAllocationType;
  /** 변제일. 민법 제477조 제1호의 변제기 도래 판정 기준일 (미지정이면 계산 시점 기준). */
  paidAt?: string;
  targets: TargetInputState[];
  /** 추가 변제 행의 React key. */
  uid?: string;
  /** "setoff" 는 상계 (변제일 칸에 상계적상일). */
  kind?: "payment" | "setoff";
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

/** "12.5" → 0.125. 부동소수 잡음(0.07 / 100 등)을 10자리에서 끊는다. */
function parsePercentText(text: string | undefined): number {
  const value = Number((text ?? "").replace(/,/g, "").trim());
  return Number.isFinite(value) && value > 0 ? Number((value / 100).toFixed(10)) : 0;
}

function toPaymentInput(payment: PaymentInputState): AppropriationPaymentInput {
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
  return {
    amount,
    allocation,
    ...(payment.paidAt ? { paidAt: payment.paidAt } : {}),
    ...(payment.kind === "setoff" ? { kind: "setoff" as const } : {}),
  };
}

function toPaymentState(payment: AppropriationPaymentInput, uid?: string): PaymentInputState {
  return {
    ...(uid ? { uid } : {}),
    amountText: String(payment.amount),
    allocationType: payment.allocation.type,
    paidAt: payment.paidAt ?? "",
    ...(payment.kind === "setoff" ? { kind: "setoff" as const } : {}),
    targets:
      payment.allocation.type === "legal"
        ? []
        : payment.allocation.targets.map((target) => ({
            uid: newUid(),
            claimId: target.claimId,
            amountText: String(target.amount),
          })),
  };
}

export function buildAppropriationInput(
  claims: ClaimInputState[],
  payment: PaymentInputState,
  computedAt?: string,
  additionalPayments: PaymentInputState[] = [],
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
    const rate = parsePercentText(claim.interestRateText);
    if (rate > 0) base.interestRate = rate;
    if (claim.interestFrom) base.interestFrom = claim.interestFrom;
    if (claim.limitEnabled) {
      const prepaid = parseWonAmount(claim.prepaidText ?? "", 0);
      base.interestLimitAct = {
        agreedAt: claim.limitAgreedAt ?? "",
        ...(prepaid > 0 ? { prepaidInterest: prepaid } : {}),
      };
    }
    return base;
  });

  const input: AppropriationInput = {
    claims: claimInputs,
    payment: toPaymentInput(payment),
  };
  if (additionalPayments.length > 0) {
    input.additionalPayments = additionalPayments.map(toPaymentInput);
  }
  if (computedAt) input.computedAt = computedAt;
  return input;
}

export function applyLoadedAppropriationInput(input: AppropriationInput): {
  claims: ClaimInputState[];
  payment: PaymentInputState;
  additionalPayments: PaymentInputState[];
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
    interestRateText:
      claim.interestRate === undefined ? "" : String(Number((claim.interestRate * 100).toFixed(8))),
    interestFrom: claim.interestFrom ?? "",
    limitEnabled: claim.interestLimitAct !== undefined,
    limitAgreedAt: claim.interestLimitAct?.agreedAt ?? "",
    prepaidText: claim.interestLimitAct?.prepaidInterest
      ? String(claim.interestLimitAct.prepaidInterest)
      : "",
  }));
  return {
    claims,
    payment: toPaymentState(input.payment),
    additionalPayments: (input.additionalPayments ?? []).map((p) => toPaymentState(p, newUid())),
  };
}

function kindLabel(kind: "payment" | "setoff"): string {
  return kind === "setoff" ? "상계" : "변제";
}

const ALLOCATION_LABEL: Record<AppropriationAllocationType, string> = {
  legal: "법정충당",
  agreement: "합의",
  debtorDesignation: "채무자 지정",
  creditorDesignation: "채권자 지정",
};

/**
 * 요약 줄 (화면·클립보드·PDF·CSV 공통). 변제액에는 변제마다의 충당 방식을 날짜 순으로 적는다.
 * 상계의 미충당액은 반환할 돈이 아니라 남은 자동채권이므로 잉여(반환)와 따로 적는다.
 */
export function appropriationSummaryRows(result: AppropriationResult): [string, string][] {
  const events = result.events ?? [];
  const methods =
    events.length > 0
      ? events.map((e) => ALLOCATION_LABEL[e.allocationType]).join(", ")
      : ALLOCATION_LABEL[result.payment.allocationType];
  const setoffRemainder = events
    .filter((e) => e.kind === "setoff")
    .reduce((sum, e) => sum + e.unappliedAmount, 0);
  return [
    ["변제액", `${formatWon(result.payment.amount)} (${methods})`],
    ["충당 합계", formatWon(result.payment.appliedAmount)],
    ["잉여 (반환)", formatWon(result.payment.unappliedAmount - setoffRemainder)],
    ...(setoffRemainder > 0
      ? [["상계 후 남은 자동채권", formatWon(setoffRemainder)] as [string, string]]
      : []),
  ];
}

/** 이자제한법 검토 문구 (화면·클립보드·PDF·CSV 공통). */
export function appropriationNotices(result: AppropriationResult): string[] {
  return [
    ...(result.interestLimits ?? []).map((limit) => `${limit.claimId}: ${limit.notice}`),
    ...(result.interpretationNotices ?? []),
  ];
}

/** 변제별 충당 표 (화면·클립보드·PDF·CSV 공통). 여러 번 변제 결과에만 있다. */
export function appropriationEventRows(result: AppropriationResult): string[][] {
  return (result.events ?? []).flatMap((event) =>
    event.claims.map((claim) => [
      event.paidAt,
      `${kindLabel(event.kind)} ${formatWon(event.amount)}`,
      claim.name ?? claim.claimId,
      claim.statutoryRank?.priorityLabel ?? "-",
      formatWon(claim.interestAccrued),
      `${formatWon(claim.costApplied)} / ${formatWon(claim.interestApplied)} / ${formatWon(
        claim.principalApplied,
      )}`,
      `${formatWon(claim.interestBalanceAfter)} / ${formatWon(claim.principalBalanceAfter)}`,
    ]),
  );
}

export const EVENT_HEADERS = [
  "변제일",
  "구분",
  "채권",
  "충당 순위",
  "새 이자",
  "충당 (비용/이자/원본)",
  "잔액 (이자/원본)",
];

const CLAIM_HEADERS = ["채권", "충당 순위", "차감 (비용/이자/원본)", "잔액 (이자/원본)"];

function claimRows(result: AppropriationResult): string[][] {
  return result.claims.map((claim) => [
    claim.name ?? claim.claimId,
    claim.statutoryRank?.priorityLabel ?? "-",
    `${formatWon(claim.costApplied)} / ${formatWon(claim.interestApplied)} / ${formatWon(
      claim.principalApplied,
    )}`,
    `${formatWon(claim.interestBalanceAfter)} / ${formatWon(claim.principalBalanceAfter)}`,
  ]);
}

function dataVersionText(result: AppropriationResult): string {
  return result.interestLimitsDataVersion
    ? `${result.dataVersion} / ${result.interestLimitsDataVersion}`
    : result.dataVersion;
}

export function buildAppropriationExportView(
  result: AppropriationResult,
  note: string,
): AppropriationExportView {
  const tables = [{ title: "채권별 결과", headers: CLAIM_HEADERS, rows: claimRows(result) }];
  if (result.events) {
    tables.push({
      title: "변제별 충당",
      headers: EVENT_HEADERS,
      rows: appropriationEventRows(result),
    });
  }
  return {
    summary: [
      ...appropriationSummaryRows(result),
      ["남은 금액 합계", formatWon(result.totals.remainingGrandTotal)],
    ],
    tables,
    notes: [...appropriationNotices(result), ...(note.trim() ? [`비고: ${note.trim()}`] : [])],
    disclaimer: result.disclaimer || STANDARD_DISCLAIMER,
    dataVersion: dataVersionText(result),
    computedAt: result.computedAt,
  };
}

export function formatAppropriationForClipboard(result: AppropriationResult): string {
  const claimLines = result.claims
    .map(
      (claim) =>
        `${claim.name ?? claim.claimId}\t${claim.statutoryRank?.priorityLabel ?? "-"}\t차감 ${formatWon(
          claim.totalApplied,
        )}\t잔액 ${formatWon(
          claim.principalBalanceAfter + claim.interestBalanceAfter + claim.costBalanceAfter,
        )}`,
    )
    .join("\n");

  return [
    "LawCalc Korea 변제충당 계산 결과",
    ...appropriationSummaryRows(result).map(([label, value]) => `${label}: ${value}`),
    `데이터 버전: ${result.dataVersion}`,
    `계산 시각: ${result.computedAt}`,
    "",
    "채권\t충당 순위\t차감액\t잔액",
    claimLines,
    ...(result.events
      ? [
          "",
          "변제별 충당",
          EVENT_HEADERS.join("\t"),
          ...appropriationEventRows(result).map((row) => row.join("\t")),
        ]
      : []),
    ...(appropriationNotices(result).length > 0 ? ["", ...appropriationNotices(result)] : []),
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
    // 변제일이 실제로 담긴 파일만 @2 로 올린다. optional 은 구파일 → 신앱 방향만 안전하고,
    // 반대로 구앱이 이 필드를 버리면 변제기 판정이 저장 당시와 달라져 충당 순서가 뒤집힌다.
    // 여러 번 변제·상계·이자·이자제한법 키가 있으면 @3. 구앱이 이 키를 버리면 결과가 달라진다.
    envelopeFeatures: [
      isExtendedAppropriationInput(input)
        ? "appropriation@3"
        : input.payment.paidAt
          ? "appropriation@2"
          : "appropriation@1",
    ],
    dataVersions: { appropriation: result.dataVersion },
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

function claimsForDirtySnapshot(claims: ClaimInputState[]) {
  return claims.map((claim) => ({
    id: claim.id,
    name: claim.name,
    costBalanceText: claim.costBalanceText,
    interestBalanceText: claim.interestBalanceText,
    principalBalanceText: claim.principalBalanceText,
    dueAt: claim.dueAt,
    debtorBenefitRankText: claim.debtorBenefitRankText,
    interestRateText: claim.interestRateText,
    interestFrom: claim.interestFrom,
    limitEnabled: claim.limitEnabled,
    limitAgreedAt: claim.limitAgreedAt,
    prepaidText: claim.prepaidText,
  }));
}

function paymentForDirtySnapshot(payment: PaymentInputState) {
  return {
    amountText: payment.amountText,
    allocationType: payment.allocationType,
    paidAt: payment.paidAt,
    kind: payment.kind,
    targets: targetsForDirtySnapshot(payment.targets),
  };
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
  additionalPayments,
  note,
}: {
  claims: ClaimInputState[];
  payment: PaymentInputState;
  additionalPayments: PaymentInputState[];
  note: string;
}) {
  return createLcalcDirtySnapshot({
    claims: claimsForDirtySnapshot(claims),
    payment: paymentForDirtySnapshot(payment),
    additionalPayments: additionalPayments.map(paymentForDirtySnapshot),
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
    paidAt: "",
    targets: [],
  }));
  const [additionalPayments, setAdditionalPayments] = useState<PaymentInputState[]>([]);
  const [note, setNote] = useState("");
  const [loadingAction, setLoadingAction] = useState<ActionName | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const input = useMemo(
    () => buildAppropriationInput(claims, payment, undefined, additionalPayments),
    [claims, payment, additionalPayments],
  );

  const dirtySnapshot = useMemo(
    () => buildAppropriationDirtySnapshot({ claims, payment, additionalPayments, note }),
    [claims, payment, additionalPayments, note],
  );
  const markAppropriationClean = useLcalcDirtyTracker("appropriation", dirtySnapshot);
  const pristineSnapshotRef = useRef(dirtySnapshot);
  const resultFingerprint = buildAppropriationDirtySnapshot({
    claims,
    payment,
    additionalPayments,
    note: "",
  });
  const {
    value: result,
    setValue: setResult,
    setLoaded: setLoadedResult,
    stale: resultStale,
    notice: resultNotice,
  } = useResultFingerprint<AppropriationResult>(resultFingerprint);
  const {
    value: error,
    setValue: setError,
    stale: errorStale,
  } = useResultFingerprint<string>(resultFingerprint);
  const resultReady = result !== null && !resultStale;

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
    setPayment({ amountText: "500000", allocationType: "legal", paidAt: "", targets: [] });
    setAdditionalPayments([]);
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

  const addPayment = () => {
    setAdditionalPayments((prev) => [
      ...prev,
      { uid: newUid(), amountText: "", allocationType: "legal", paidAt: "", targets: [] },
    ]);
  };

  const updateAdditionalPayment = (uid: string, next: PaymentInputState) => {
    setAdditionalPayments((prev) => prev.map((p) => (p.uid === uid ? next : p)));
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
      await ipc.copyToClipboard(formatAppropriationForClipboard(result));
      return "변제충당 계산 결과를 클립보드에 복사했습니다.";
    });

  const handleExport = (kind: "pdf" | "hwpx" | "csv") =>
    runAction(kind, async () => {
      if (!result || resultStale) throw new Error("계산 후 내보내 주세요.");
      const view = buildAppropriationExportView(result, note);
      const path =
        kind === "pdf"
          ? await ipc.exportAppropriationPdf(view)
          : kind === "hwpx"
            ? await ipc.exportHwpx("appropriation", view)
            : await ipc.exportAppropriationCsv(view);
      return path ? `${kind.toUpperCase()} 파일을 저장했습니다: ${path}` : "저장을 취소했습니다.";
    });

  const handleSaveLcalc = () =>
    runAction("save", async () => {
      if (!result || resultStale) throw new Error("계산 후 .lcalc 파일을 저장해 주세요.");
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
    setAdditionalPayments(applied.additionalPayments);
    setNote(loadedNote);
    const differs = setLoadedResult(
      loaded.result,
      () => computeAppropriation(loaded.input),
      (r) => formatWon(r.totals.remainingGrandTotal),
    );
    setError(null);
    markAppropriationClean(buildAppropriationDirtySnapshot({ ...applied, note: loadedNote }));
    return differs;
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
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs">
                    약정 연이율(%)
                    <Input
                      inputMode="decimal"
                      placeholder="비우면 이자 없음"
                      value={claim.interestRateText ?? ""}
                      onChange={(e) => updateClaim(claim.uid, { interestRateText: e.target.value })}
                    />
                  </label>
                  <label className="grid gap-1 text-xs">
                    이자 기산일
                    <Input
                      type="date"
                      value={claim.interestFrom ?? ""}
                      onChange={(e) => updateClaim(claim.uid, { interestFrom: e.target.value })}
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={claim.limitEnabled ?? false}
                    onChange={(e) => updateClaim(claim.uid, { limitEnabled: e.target.checked })}
                  />
                  이자제한법 적용 (금전대차, 약정일 기준 최고이자율)
                </label>
                {claim.limitEnabled ? (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1 text-xs">
                      약정일
                      <Input
                        type="date"
                        value={claim.limitAgreedAt ?? ""}
                        onChange={(e) => updateClaim(claim.uid, { limitAgreedAt: e.target.value })}
                      />
                    </label>
                    <label className="grid gap-1 text-xs">
                      사전공제한 선이자 (제3조)
                      <Input
                        inputMode="numeric"
                        placeholder="없으면 비움"
                        value={formatWonInput(claim.prepaidText ?? "")}
                        onChange={(e) =>
                          updateClaim(claim.uid, { prepaidText: parseWonText(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                ) : null}
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
            <PaymentFields value={payment} claims={claims} onChange={setPayment} />
            {additionalPayments.map((extra, index) => (
              <div key={extra.uid} className="grid gap-3 rounded-md border border-input p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">추가 변제·상계 {index + 1}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="추가 변제 삭제"
                    onClick={() =>
                      setAdditionalPayments((prev) => prev.filter((p) => p.uid !== extra.uid))
                    }
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <PaymentFields
                  value={extra}
                  claims={claims}
                  onChange={(next) => updateAdditionalPayment(extra.uid!, next)}
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={addPayment}
              type="button"
              className="w-fit"
            >
              <Plus className="mr-1 h-3 w-3" />
              변제·상계 추가
            </Button>
            <span className="text-xs text-muted-foreground">
              변제를 여러 번 넣거나 이율·상계·이자제한법을 쓰면 모든 변제에 변제일이 필요합니다.
              날짜 순서로 충당하고, 각 변제일까지 이자를 붙인 뒤 비용, 이자, 원본 순으로
              충당합니다(민법 제479조).
            </span>
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
        {error && !errorStale ? (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
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
                  {appropriationSummaryRows(result).map(([label, value]) => (
                    <Fragment key={label}>
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-right">{value}</span>
                    </Fragment>
                  ))}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">채권</th>
                      {/* 변제일을 바꿔도 숫자만 움직이고 이유가 안 보이던 것을 드러낸다.
                          엔진이 이미 채권마다 statutoryRank 를 돌려주고 있었다. */}
                      <th className="py-2 font-medium">충당 순위</th>
                      <th className="py-2 text-right font-medium">차감 (비용/이자/원본)</th>
                      <th className="py-2 text-right font-medium">잔액 (이자/원본)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.claims.map((claim) => (
                      <tr key={claim.claimId} className="border-b border-border last:border-b-0">
                        <td className="py-2">{claim.name ?? claim.claimId}</td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {claim.statutoryRank?.priorityLabel ?? "-"}
                        </td>
                        <td className="py-2 text-right text-xs">
                          {formatWon(claim.costApplied)} / {formatWon(claim.interestApplied)} /{" "}
                          {formatWon(claim.principalApplied)}
                        </td>
                        <td className="py-2 text-right">
                          {formatWon(claim.interestBalanceAfter)} /{" "}
                          {formatWon(claim.principalBalanceAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.events ? (
                  <table className="w-full text-xs" aria-label="변제별 충당">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        {EVENT_HEADERS.map((header) => (
                          <th key={header} className="py-2 font-medium">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {appropriationEventRows(result).map((row, index) => (
                        <tr key={index} className="border-b border-border last:border-b-0">
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="py-1.5">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                {appropriationNotices(result).map((notice) => (
                  <p
                    key={notice}
                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                  >
                    {notice}
                  </p>
                ))}
                <div className="grid gap-1 text-xs text-muted-foreground">
                  <span>데이터 버전: {dataVersionText(result)}</span>
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
                action="pdf"
                icon={FileText}
                label="PDF"
                loadingAction={loadingAction}
                requiresResult
                resultReady={resultReady}
                onClick={() => handleExport("pdf")}
              />
              <ActionButton
                action="hwpx"
                icon={FileText}
                label="HWPX 저장"
                loadingAction={loadingAction}
                requiresResult
                resultReady={resultReady}
                onClick={() => handleExport("hwpx")}
              />
              <ActionButton
                action="csv"
                icon={FileSpreadsheet}
                label="CSV"
                loadingAction={loadingAction}
                requiresResult
                resultReady={resultReady}
                onClick={() => handleExport("csv")}
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
                좌측에서 채권 잔액과 변제 정보를 입력한 후{" "}
                <span className="font-medium text-foreground">계산</span> 버튼을 누르세요.
              </p>
              <p className="text-xs">
                근거: 민법 제476조 (지정충당) / 제477조 (법정충당) / 제479조 (비용·이자·원본 순),
                제492조·제493조·제499조 (상계), 이자제한법 제2조·제3조. 이자는 원본에만 붙이고 (복리
                없음) 법원 이자계산 방식(초일 산입, 원 미만 절사)으로 계산합니다.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

/**
 * 변제 1건 입력 (변제 금액·변제일·종류·충당 방식·충당 대상). 첫 변제와 추가 변제가 같이 쓴다.
 */
function PaymentFields({
  value,
  claims,
  onChange,
}: {
  value: PaymentInputState;
  claims: ClaimInputState[];
  onChange: (next: PaymentInputState) => void;
}) {
  const update = (patch: Partial<PaymentInputState>) => onChange({ ...value, ...patch });
  const updateTarget = (uid: string, patch: Partial<TargetInputState>) =>
    update({ targets: value.targets.map((t) => (t.uid === uid ? { ...t, ...patch } : t)) });

  return (
    <>
      <label className="grid gap-2 text-sm font-medium">
        변제 금액
        <Input
          inputMode="numeric"
          placeholder="예: 500,000"
          value={formatWonInput(value.amountText)}
          onChange={(e) => update({ amountText: parseWonText(e.target.value) })}
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        변제일
        <Input
          type="date"
          value={value.paidAt}
          onChange={(e) => update({ paidAt: e.target.value })}
        />
        <span className="text-xs font-normal text-muted-foreground">
          법정충당의 변제기 도래 여부(제477조 제1호)를 판정하는 기준일입니다. 비워 두면 오늘 날짜로
          판정하므로, 과거 변제를 재현하거나 저장한 파일을 나중에 다시 열 때는 실제 변제일을
          입력하세요. 상계는 상계적상일(두 채무가 상계할 수 있게 된 날)을 넣습니다.
        </span>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        종류
        <Select
          value={value.kind ?? "payment"}
          onChange={(e) => update({ kind: e.target.value === "setoff" ? "setoff" : "payment" })}
        >
          <option value="payment">변제</option>
          <option value="setoff">상계 (민법 제492조, 제493조 제2항)</option>
        </Select>
        <span className="text-xs font-normal text-muted-foreground">
          상계는 상계적상일에 소급해 대등액만큼 소멸하고, 충당은 변제와 같은 규칙을 따릅니다
          (제499조). 상계 금지(제496조~제498조)는 따로 확인하세요.
        </span>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        충당 방식
        <Select
          value={value.allocationType}
          onChange={(e) =>
            update({
              allocationType: e.target.value as AppropriationAllocationType,
              targets: e.target.value === "legal" ? [] : value.targets,
            })
          }
        >
          <option value="legal">법정충당 (제477조)</option>
          <option value="agreement">합의 (1순위)</option>
          <option value="debtorDesignation">채무자(변제자) 지정 (제476조 제1항)</option>
          <option value="creditorDesignation">채권자(변제받는 자) 지정 (제476조 제2항)</option>
        </Select>
        <span className="text-xs font-normal text-muted-foreground">
          충당 방법은 합의 → 지정(채무자·채권자) → 법정 순으로 우선합니다. 충당 대상보다 변제액이
          크면 잉여는 법정충당(제477조) 순서로 잔여 채권에 충당합니다.
        </span>
      </label>
      {value.allocationType !== "legal" ? (
        <div className="grid gap-2">
          <div className="text-xs font-medium text-muted-foreground">충당 대상</div>
          {value.targets.map((target) => (
            <div key={target.uid} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
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
                onClick={() =>
                  update({ targets: value.targets.filter((t) => t.uid !== target.uid) })
                }
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              update({ targets: [...value.targets, emptyTarget(claims[0]?.id ?? "")] })
            }
            type="button"
            className="w-fit"
          >
            <Plus className="mr-1 h-3 w-3" />
            대상 추가
          </Button>
        </div>
      ) : null}
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
