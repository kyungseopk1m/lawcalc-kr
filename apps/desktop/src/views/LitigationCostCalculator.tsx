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
  getDeliveryCount,
  listCaseTypes,
  loadDeliveryDataset,
  resolveEffectiveCaseValue,
  type AppealsLevel,
  type CaseType,
  type LawyerFeeDiscount,
  type LitigationCostInput,
  type DeliveryFormula,
  type LitigationCostResult,
  type StampDutyInput,
} from "@lawcalc-kr/core-engine";

/** 소가 산정 기준 (인지규칙 제18조의2). 엔진 입력 타입에서 파생해 두 곳이 어긋나지 않게 한다. */
type CaseValueBasis = NonNullable<StampDutyInput["caseValueBasis"]>;

/**
 * 보전사건의 사건 성격 (변호사보수규칙 제3조 제2항).
 *
 * 단서는 "가압류, 가처분 명령의 신청사건에 있어서는 변론 또는 심문을 거친 경우에 한한다"라
 * 신청사건 전용이다. 이의·취소 신청사건은 단서 대상이 아니므로 변론·심문 여부와 무관하게
 * 1/2 이 산입된다. 직전 UI 는 체크박스 하나뿐이라 이의·취소 사건도 산입 불가(0원)로 강제됐다.
 */
type ProvisionalApplicationKind =
  | "unspecified"
  | "applicationWithHearing"
  | "applicationWithoutHearing"
  | "objectionOrCancellation";

import { CaseValueEstimator } from "../components/form/CaseValueEstimator";
import { ClaimAmendmentPanel } from "../components/form/ClaimAmendmentPanel";
import { ProportionalPillInput } from "../components/form/ProportionalPillInput";
import { ResultFreshnessNotice } from "../components/result/ResultFreshnessNotice";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { useFormShortcuts } from "../hooks/use-form-shortcuts";
import { useResultFingerprint } from "../hooks/use-result-fingerprint";
import { useCaseSlot } from "../lib/case-file";
import { formatWon, formatWonInput, parseWonText } from "../lib/format-won";
import { ipc, type LcalcFile, type LcalcLitigationCostPayload } from "../lib/ipc";
import { createLcalcDirtySnapshot, useLcalcDirtyTracker } from "../lib/lcalc-dirty-state";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "../lib/lcalc-migrations";
import { FieldError, parseNumberText, type ParsedNumber } from "../lib/parse-number";
import {
  parseLoadedLitigationCostLcalcInput,
  validateLcalcEnvelope,
} from "../lib/lcalc-validation";
import { todayIso } from "../lib/today";

const APP_VERSION = __APP_VERSION__;

type ActionName = "pdf" | "csv" | "copy" | "save" | "load";
type DistributionMode = "equal" | "proportional";

interface ToastState {
  type: "success" | "error";
  message: string;
}

function formatComputedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** 소가 칸. 읽지 못한 값이나 빈칸을 0원으로 바꾸면 인지대가 조용히 0원이 된다. */
function caseValueParsed(text: string): ParsedNumber {
  const parsed = parseNumberText(text, { integer: true, min: 0 });
  return parsed.error === undefined && parsed.value === undefined
    ? { error: "소가를 입력하세요." }
    : parsed;
}

// 횟수·인원 칸. "10명" 처럼 라벨 단위를 붙여도 읽는다. 읽지 못한 값은 칸 옆 오류로 계산을
// 막고(`numberFieldErrors`), 여기서는 화면이 그려지도록 fallback 만 돌려준다.
const PARTY_COUNT_FORMAT = { unit: "명", integer: true, min: 1 } as const;
const CREDITOR_COUNT_FORMAT = { unit: "명", integer: true, min: 0 } as const;
const INSTITUTION_COUNT_FORMAT = { unit: "곳", integer: true, min: 0 } as const;
const DELIVERY_COUNT_FORMAT = { unit: "회", integer: true, min: 1 } as const;

function parsePositiveInteger(
  value: string,
  fallback: number,
  format: Parameters<typeof parseNumberText>[1] = { integer: true, min: 1 },
): number {
  return parseNumberText(value, format).value ?? fallback;
}

function parseNonNegativeInteger(
  value: string,
  fallback: number,
  format: Parameters<typeof parseNumberText>[1] = { integer: true, min: 0 },
): number {
  return parseNumberText(value, format).value ?? fallback;
}

const PROPORTIONAL_VALUE_TOKEN = /^\d{1,3}(?:,\d{3})+$|^\d+$/;

const PROPORTIONAL_SEPARATOR = /(?:,\s+|\s+|\/)+/;

/**
 * 당사자별 소가 칸의 오류. `parseProportionalValues` 는 읽지 못한 토큰을 건너뛰므로, 계산
 * 전에 여기서 걸러 조용히 빠지는 당사자가 없게 한다. 문제가 없으면 undefined.
 */
export function proportionalValuesError(value: string): string | undefined {
  const tokens = value.split(PROPORTIONAL_SEPARATOR).filter((part) => part.length > 0);
  const unreadable = tokens.filter(
    (part) => !PROPORTIONAL_VALUE_TOKEN.test(part) || Number(part.replaceAll(",", "")) === 0,
  );
  if (unreadable.length > 0) return `읽지 못한 값이 있습니다: ${unreadable.join(", ")}`;
  if (tokens.length === 0) return "당사자별 소가를 하나 이상 입력하세요.";
  return undefined;
}

function proportionalParsed(value: string): ParsedNumber {
  const error = proportionalValuesError(value);
  return error === undefined ? {} : { error };
}

export function parseProportionalValues(value: string): number[] {
  return value
    .split(PROPORTIONAL_SEPARATOR)
    .filter((part) => PROPORTIONAL_VALUE_TOKEN.test(part))
    .map((part) => Number(part.replaceAll(",", "")))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * v0.10.0 이하는 지급명령 감액 체크박스 값을 사건구분과 별개로 `stampDuty.isPaymentOrder` 에
 * 저장했다. 체크박스를 없앤 뒤로 이 값을 흘려보내지 않으면 구파일을 다시 계산할 때 제7조 제2항
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
  /** 소가 산정 기준 (인지규칙 제18조의2). 미지정 시 `"amount"`. */
  caseValueBasis?: CaseValueBasis;
  /** 항소·상고로 불복하는 범위의 소가. 미지정 시 `caseValue` 를 그대로 쓴다. */
  appealValue?: number;
  caseType: CaseType;
  appealsLevel: AppealsLevel;
  legacyPaymentOrder: boolean;
  isSettlement: boolean;
  isElectronicFiling: boolean;
  provisionalMeasureType: "general" | "provisionalStatus";
  /**
   * 항고·재항고(라/마) 에서 인지법 제11조 제1항 대상일 때 원신청서에 붙인 인지액.
   * 미지정이면 제11조 제2항 정액 2,000원이 적용된다.
   */
  underlyingApplicationStampDutyWon?: number;
  filingDate: string;
}): LitigationCostInput["stampDuty"] {
  const isProvisional =
    state.caseType === "provisionalMeasureCollegial" ||
    state.caseType === "provisionalMeasureSingle";
  // 보전처분은 제9조 제2항 별도 체계라 지급명령 감액 자체가 성립하지 않는다 (validator 도 거부).
  const isPaymentOrder =
    !isProvisional && (state.caseType === "paymentOrder" || state.legacyPaymentOrder);
  // 조정신청(머)은 「민사조정규칙」제3조의 신청 수수료라 심급 배수를 탈 자리가 없다
  // (validator 도 거부한다).
  const isMediation = state.caseType === "civilMediation";
  const appealsLevel: AppealsLevel =
    isProvisional || isPaymentOrder || isMediation ? "firstInstance" : state.appealsLevel;

  // 「민사소송 등 인지규칙」제25조(원칙): "항소장 또는 상고장에 첩부할 인지액은 상소로써
  // 불복하는 범위의 소가를 기준으로 하여 산정한다." 전체 소가를 그대로 쓰면 일부만
  // 불복하는 사건에서 인지대가 과대해진다.
  // 심급 판정과 같은 곳에서 정하므로 인지와 변호사보수가 서로 다른 기준을 쓸 수 없다.
  const effectiveCaseValue =
    appealsLevel === "firstInstance" ? state.caseValue : (state.appealValue ?? state.caseValue);

  return {
    caseValue: effectiveCaseValue,
    caseType: state.caseType,
    appealsLevel,
    // 간주 소가일 때는 엔진이 소가를 대체하므로 불복 범위 대체는 의미가 없다.
    ...(state.caseValueBasis && state.caseValueBasis !== "amount"
      ? { caseValueBasis: state.caseValueBasis }
      : {}),
    ...(isProvisional ? { provisionalMeasureType: state.provisionalMeasureType } : {}),
    // 사건구분이 차(paymentOrder)면 엔진이 자동 파생한다. 구파일 플래그일 때만 명시 전달.
    ...(isPaymentOrder && state.caseType !== "paymentOrder" ? { isPaymentOrder: true } : {}),
    ...(state.isSettlement && !isProvisional && !isPaymentOrder ? { isSettlement: true } : {}),
    ...(state.isElectronicFiling ? { isElectronicFiling: true } : {}),
    ...(state.filingDate ? { filingDate: state.filingDate } : {}),
    // 제11조 제1항은 항고 사건에서만 의미가 있다. 다른 사건구분에 흘려보내면 엔진이 무시하지만
    // `.lcalc` 에는 남아 파일을 읽는 쪽을 헷갈리게 한다.
    ...(state.caseType === "civilInterlocutoryAppeal" &&
    state.underlyingApplicationStampDutyWon !== undefined
      ? { underlyingApplicationStampDutyWon: state.underlyingApplicationStampDutyWon }
      : {}),
    // 상소심에서 `caseValue` 는 불복 범위다. 전체 소가를 함께 남기지 않으면 파일에서
    // 사라져 복원할 수 없다 (심급을 1심으로 되돌리면 조용히 과소 계산된다).
    ...(appealsLevel !== "firstInstance" && effectiveCaseValue !== state.caseValue
      ? { fullCaseValue: state.caseValue }
      : {}),
  };
}

/**
 * 보전사건 변호사보수 discount 조립 (변호사보수규칙 제3조 제2항).
 *
 * 본문 1/2 은 엔진이 사건구분만으로 자동 적용하므로 여기서는 단서 판정에 필요한
 * 사건 성격만 전달한다. 단서("가압류, 가처분 명령의 신청사건에 있어서는 변론 또는
 * 심문을 거친 경우에 한한다")는 신청사건 전용이라, 이의·취소 신청사건은 변론·심문
 * 여부와 무관하게 1/2 이 산입된다.
 *
 * 직전 UI 는 체크박스 하나뿐이라 이의·취소 사건에도 `hasOralHearing: false` 를 붙여
 * 산입 불가(0원)로 강제했다.
 */
export function buildProvisionalDiscount(
  kind: ProvisionalApplicationKind,
  caseType: CaseType,
): LawyerFeeDiscount | null {
  const isProvisional =
    caseType === "provisionalMeasureCollegial" || caseType === "provisionalMeasureSingle";
  if (!isProvisional || kind === "unspecified") return null;
  if (kind === "objectionOrCancellation") {
    return { kind: "provisionalCase", applicationKind: "objectionOrCancellation" };
  }
  return {
    kind: "provisionalCase",
    applicationKind: "application",
    hasOralHearing: kind === "applicationWithHearing",
  };
}

function distributionLabel(mode: DistributionMode) {
  return mode === "equal" ? "균등" : "소가 비례";
}

/**
 * 소송비용 결과의 사용자 경고 문구 — **단일 출처**.
 *
 * 대한법률구조공단 적용 사건 범위 경고가 화면에만 있고 clipboard·PDF·CSV 에는 없었다.
 * 손해배상 export 와 같은 정책으로, 문구를 여기서 한 번 만들어 세 경로가 함께 쓴다.
 */
export function buildLitigationCostExportWarnings(result: LitigationCostResult): string[] {
  return result.lawyerFee.koreaLegalAidWarnings.map((w) => w.messageKo);
}

/** export payload — 결과 원본에 경고 목록만 덧붙인다. `.lcalc` 에는 저장하지 않는다. */
function withLitigationCostExportWarnings(result: LitigationCostResult) {
  return { ...result, exportWarnings: buildLitigationCostExportWarnings(result) };
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
    ...(buildLitigationCostExportWarnings(result).length > 0
      ? [
          "",
          "확인이 필요한 사항",
          ...buildLitigationCostExportWarnings(result).map((w) => `- ${w}`),
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
    // optional 은 **구파일 → 신앱** 방향만 안전하다. 반대로 신파일을 구앱이 열면 이 필드들이
    // 조용히 버려져 금액이 달라지므로(간주 소가 무시 → 1,000원, 전체 소가 유실 → 불복 범위로
    // 재계산) 실제로 붙은 파일만 @2 로 올려 구앱이 fast-reject 하게 한다.
    envelopeFeatures: [
      input.stampDuty.fullCaseValue !== undefined ||
      input.stampDuty.underlyingApplicationStampDutyWon !== undefined ||
      (input.stampDuty.caseValueBasis !== undefined && input.stampDuty.caseValueBasis !== "amount")
        ? "litigation-cost@2"
        : "litigation-cost@1",
    ],
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

/**
 * 사건구분의 송달 횟수 산식 kind. UI 가 어떤 추가 입력을 띄울지 결정한다.
 *
 * 매트릭스가 13종이던 동안에는 전부 `simplePerParty` 라 당사자수 하나로 충분했다.
 * 민사집행·도산·가사비송이 들어오면서 채권자수(도산)·조회기관수(재산조회)·직접 입력 회수
 * (범위 사건) 가 필요해졌고, 이 값이 없으면 엔진이 RangeError 를 던진다.
 */
function deliveryFormulaOf(caseType: CaseType): DeliveryFormula {
  return getDeliveryCount(loadDeliveryDataset(), caseType).formula;
}

export function LitigationCostCalculator({ active = true }: { active?: boolean }) {
  const [caseType, setCaseType] = useState<CaseType>("civilFirstInstanceSingle");
  const [caseValueText, setCaseValueText] = useState("30000000");
  const [caseValueBasis, setCaseValueBasis] = useState<CaseValueBasis>("amount");
  const [appealsLevel, setAppealsLevel] = useState<AppealsLevel>("firstInstance");
  // 비워 두면 빌더가 소가를 그대로 쓴다. 초기값을 넣어 두면 소가만 고쳤을 때 불복 범위가
  // 옛 값에 남아 인지대가 조용히 틀린다 (인지 부족은 보정명령 사유다).
  const [appealValueText, setAppealValueText] = useState("");
  // 항고 사건의 원신청서 인지액 (인지법 제11조 제1항). 비우면 제11조 제2항 정액 2,000원.
  const [underlyingStampDutyText, setUnderlyingStampDutyText] = useState("");
  const [partyCountText, setPartyCountText] = useState("2");
  // 확장 사건구분 전용 입력. 산식 kind 가 요구할 때만 화면에 뜬다.
  const [creditorCountText, setCreditorCountText] = useState("0");
  const [inquiredInstitutionsText, setInquiredInstitutionsText] = useState("0");
  const [deliveryCountText, setDeliveryCountText] = useState("");
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
  const [provisionalApplicationKind, setProvisionalApplicationKind] =
    useState<ProvisionalApplicationKind>("unspecified");
  const [applyKoreaLegalAid, setApplyKoreaLegalAid] = useState(false);
  const [koreaLegalAidAgreedFeeText, setKoreaLegalAidAgreedFeeText] = useState("");
  const [courtMultiplierText, setCourtMultiplierText] = useState("1");
  const [customRateText, setCustomRateText] = useState("1");
  const [useCourtMultiplier, setUseCourtMultiplier] = useState(false);
  const [useCustomRate, setUseCustomRate] = useState(false);
  const [distributionMode, setDistributionMode] = useState<DistributionMode>("equal");
  const [proportionalValuesText, setProportionalValuesText] = useState("10000000, 20000000");
  const [note, setNote] = useState("");
  const [loadingAction, setLoadingAction] = useState<ActionName | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const input = useMemo<LitigationCostInput>(() => {
    // 인지규칙 제18조의2 간주 소가는 인지·변호사보수가 같은 값을 써야 하므로
    // 엔진의 `resolveEffectiveCaseValue` 를 단일 출처로 삼는다.
    const rawCaseValue = parseNonNegativeInteger(caseValueText, 0);
    const caseValue = resolveEffectiveCaseValue({
      caseValue: rawCaseValue,
      caseValueBasis,
    }).caseValue;
    const partyCount = parsePositiveInteger(partyCountText, 1, PARTY_COUNT_FORMAT);
    const deliveryFormula = deliveryFormulaOf(caseType);
    const lawyerFeeAppliesNow = appliedDomains(caseType).includes("lawyerFee");
    // 지급명령(차)과 보전처분(카합/카단)은 심급 배수를 쓰지 않으므로 1심으로 고정한다.
    const stampDuty = buildStampDutyInput({
      caseValue: rawCaseValue,
      caseValueBasis,
      appealValue: parseNonNegativeInteger(appealValueText, rawCaseValue),
      caseType,
      appealsLevel,
      legacyPaymentOrder,
      isSettlement,
      isElectronicFiling,
      provisionalMeasureType,
      ...(parseNonNegativeInteger(underlyingStampDutyText, 0) > 0
        ? {
            underlyingApplicationStampDutyWon: parseNonNegativeInteger(underlyingStampDutyText, 0),
          }
        : {}),
      filingDate,
    });
    // 변호사보수도 같은 기준액을 쓴다 (빌더가 심급에 따라 이미 불복 범위를 반영했고,
    // 간주 소가일 때는 심급과 무관하게 간주액이 기준이다).
    const lawyerCaseValue = caseValueBasis === "amount" ? stampDuty.caseValue : caseValue;
    const discounts: LawyerFeeDiscount[] = [];
    if (lawyerFeeAppliesNow) {
      if (applyNoOral) {
        discounts.push({ kind: "noOralHearingOrAdmission", reason: "noOralHearing" });
      }
      const provisionalDiscount = buildProvisionalDiscount(provisionalApplicationKind, caseType);
      if (provisionalDiscount) {
        discounts.push(provisionalDiscount);
      }
      if (applyKoreaLegalAid) {
        discounts.push({ kind: "koreaLegalAid" });
      }
      if (useCourtMultiplier) {
        discounts.push({
          kind: "courtDiscretion",
          multiplier: parseNumberText(courtMultiplierText).value ?? Number.NaN,
        });
      }
      if (useCustomRate) {
        discounts.push({
          kind: "customPercent",
          rate: parseNumberText(customRateText).value ?? Number.NaN,
        });
      }
    }

    const base: LitigationCostInput = {
      stampDuty,
      deliveryFee: {
        caseType,
        partyCount,
        ...(deliveryFormula.kind === "baseCountPlusCreditorMultiple"
          ? {
              creditorCount: parseNonNegativeInteger(creditorCountText, 0, CREDITOR_COUNT_FORMAT),
            }
          : {}),
        ...(deliveryFormula.kind === "perPartyPlusExtra"
          ? {
              extraCount: parseNonNegativeInteger(
                inquiredInstitutionsText,
                0,
                INSTITUTION_COUNT_FORMAT,
              ),
            }
          : {}),
        ...(deliveryFormula.kind === "range"
          ? {
              customCount: parsePositiveInteger(
                deliveryCountText,
                deliveryFormula.countMin,
                DELIVERY_COUNT_FORMAT,
              ),
            }
          : {}),
        ...(caseType === "provisionalMeasureCollegial" || caseType === "provisionalMeasureSingle"
          ? { provisionalMeasureType }
          : {}),
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
    provisionalApplicationKind,
    caseType,
    caseValueBasis,
    caseValueText,
    courtMultiplierText,
    creditorCountText,
    customRateText,
    deliveryCountText,
    distributionMode,
    inquiredInstitutionsText,
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
  const stampDutyApplies = useMemo(
    () => appliedDomains(caseType).includes("stampDuty"),
    [caseType],
  );
  const deliveryFormula = useMemo(() => deliveryFormulaOf(caseType), [caseType]);
  const isProvisionalCase =
    caseType === "provisionalMeasureCollegial" || caseType === "provisionalMeasureSingle";
  const isPaymentOrderCase = caseType === "paymentOrder";
  const isMediationCase = caseType === "civilMediation";
  const isInterlocutoryAppealCase = caseType === "civilInterlocutoryAppeal";
  // 구파일 플래그도 지급명령과 같은 배타 규칙을 받는다 (1심 고정, 화해 배타).
  const paymentOrderApplies = isPaymentOrderCase || (legacyPaymentOrder && !isProvisionalCase);
  const dirtySnapshot = useMemo(() => buildDirtySnapshot(input, note), [input, note]);
  const markLitigationCostClean = useLcalcDirtyTracker("litigation-cost", dirtySnapshot);
  const pristineSnapshotRef = useRef(dirtySnapshot);

  const applyInput = (loaded: LitigationCostInput) => {
    setCaseType(loaded.stampDuty.caseType);
    // 상소심 파일의 `caseValue` 는 불복 범위다. 보존해 둔 전체 소가가 있으면 그것이 소가란.
    setCaseValueText(String(loaded.stampDuty.fullCaseValue ?? loaded.stampDuty.caseValue));
    setAppealsLevel(loaded.stampDuty.appealsLevel);
    setAppealValueText(
      loaded.stampDuty.appealsLevel === "firstInstance" ? "" : String(loaded.stampDuty.caseValue),
    );
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
    setCaseValueBasis(loaded.stampDuty.caseValueBasis ?? "amount");
    setUnderlyingStampDutyText(
      loaded.stampDuty.underlyingApplicationStampDutyWon === undefined
        ? ""
        : String(loaded.stampDuty.underlyingApplicationStampDutyWon),
    );
    setApplyNoOral(loaded.lawyerFee.discounts.some((d) => d.kind === "noOralHearingOrAdmission"));
    // 보전 사건 성격은 discount 의 applicationKind / hasOralHearing 조합에서 되살린다.
    // 구파일은 `{ kind: "provisionalCase", hasOralHearing: false }` 만 저장했으므로
    // "신청사건 · 변론·심문 없음" 으로 복원된다 (저장 당시 결과와 일치).
    const provisional = loaded.lawyerFee.discounts.find((d) => d.kind === "provisionalCase");
    setProvisionalApplicationKind(
      provisional === undefined
        ? "unspecified"
        : provisional.applicationKind === "objectionOrCancellation"
          ? "objectionOrCancellation"
          : provisional.hasOralHearing === true
            ? "applicationWithHearing"
            : provisional.hasOralHearing === false
              ? "applicationWithoutHearing"
              : "unspecified",
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

  // 화면에 보이는 숫자 칸 중 읽지 못한 것. 하나라도 있으면 계산하지 않는다.
  const numberFields: (readonly [string, ParsedNumber])[] = [
    ...(stampDutyApplies && caseValueBasis === "amount"
      ? [["소가", caseValueParsed(caseValueText)] as const]
      : []),
    ...(distributionMode === "proportional"
      ? [["당사자별 소가", proportionalParsed(proportionalValuesText)] as const]
      : []),
    ["당사자수", parseNumberText(partyCountText, PARTY_COUNT_FORMAT)],
    ...(deliveryFormula.kind === "baseCountPlusCreditorMultiple"
      ? [["채권자수", parseNumberText(creditorCountText, CREDITOR_COUNT_FORMAT)] as const]
      : []),
    ...(deliveryFormula.kind === "perPartyPlusExtra"
      ? [
          [
            "우편 조회대상 기관수",
            parseNumberText(inquiredInstitutionsText, INSTITUTION_COUNT_FORMAT),
          ] as const,
        ]
      : []),
    ...(deliveryFormula.kind === "range"
      ? [["송달 횟수", parseNumberText(deliveryCountText, DELIVERY_COUNT_FORMAT)] as const]
      : []),
    ...(lawyerFeeApplies && useCourtMultiplier
      ? [["재량 배율", parseNumberText(courtMultiplierText)] as const]
      : []),
    ...(lawyerFeeApplies && useCustomRate
      ? [["직접 배율", parseNumberText(customRateText)] as const]
      : []),
  ];
  const numberFieldError = numberFields
    .flatMap(([label, parsed]) => (parsed.error === undefined ? [] : [`${label}: ${parsed.error}`]))
    .join(" ");
  const resultFingerprint = createLcalcDirtySnapshot({ input, numberFieldError });
  const {
    value: result,
    setValue: setResult,
    setLoaded: setLoadedResult,
    stale: resultStale,
    notice: resultNotice,
  } = useResultFingerprint<LitigationCostResult>(resultFingerprint);
  const {
    value: error,
    setValue: setError,
    stale: errorStale,
  } = useResultFingerprint<string>(resultFingerprint);
  const resultReady = result !== null && !resultStale;

  const handleCalculate = () => {
    if (numberFieldError) {
      setResult(null);
      setError(numberFieldError);
      return;
    }
    try {
      const calculated = computeLitigationCost(input);
      setResult(calculated);
      setError(null);
      setToast(null);
    } catch (e) {
      setResult(null);
      // 범위 검사는 엔진 몫이라 엔진 필드명이 문구에 남는다. 화면 라벨로 바꿔 보인다.
      setError(
        (e instanceof Error ? e.message : String(e))
          .replaceAll("courtDiscretion.multiplier", "재량 배율")
          .replaceAll("customPercent.rate", "직접 배율"),
      );
    }
  };

  const handleReset = () => {
    setCaseType("civilFirstInstanceSingle");
    setCaseValueText("30000000");
    setCaseValueBasis("amount");
    setLegacyPaymentOrder(false);
    setAppealsLevel("firstInstance");
    setAppealValueText("");
    setUnderlyingStampDutyText("");
    setPartyCountText("2");
    setFilingDate(todayIso());
    setIsElectronicFiling(false);
    setIsSettlement(false);
    setProvisionalMeasureType("general");
    setAgreedFeeText("");
    setApplyNoOral(false);
    setProvisionalApplicationKind("unspecified");
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
      if (!result || resultStale) throw new Error("계산 후 PDF를 저장해 주세요.");
      const path = await ipc.exportLitigationCostPdf(withLitigationCostExportWarnings(result));
      return path ? `PDF 파일을 저장했습니다: ${path}` : null;
    });

  const handleExportCsv = () =>
    runAction("csv", async () => {
      if (!result || resultStale) throw new Error("계산 후 CSV를 저장해 주세요.");
      const path = await ipc.exportLitigationCostCsv(withLitigationCostExportWarnings(result));
      return path ? `CSV 파일을 저장했습니다: ${path}` : null;
    });

  const handleCopy = () =>
    runAction("copy", async () => {
      if (!result || resultStale) throw new Error("계산 후 복사해 주세요.");
      await ipc.copyToClipboard(formatLitigationCostForClipboard(result));
      return "소송비용 계산 결과를 클립보드에 복사했습니다.";
    });

  const handleSaveLcalc = () =>
    runAction("save", async () => {
      if (!result || resultStale) throw new Error("계산 후 .lcalc 파일을 저장해 주세요.");
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
    const differs = setLoadedResult(
      loaded.result,
      () => computeLitigationCost(loaded.input),
      (r) => formatWon(r.totalAmount),
    );
    setError(null);
    markLitigationCostClean(buildDirtySnapshot(loaded.input, loadedNote));
    return differs;
  };

  useCaseSlot("litigation-cost", {
    collect: () => {
      if (dirtySnapshot === pristineSnapshotRef.current) {
        return { status: "pristine" };
      }
      if (numberFieldError) return { status: "invalid" };
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
                  const domains = appliedDomains(value);
                  // 인지·보수가 둘 다 빠지는 사건구분은 "변호사보수 산입 외" 만 붙이면
                  // 인지액은 나오는 것처럼 읽힌다. 실제로 나오는 도메인을 그대로 적는다.
                  const suffix = !domains.includes("stampDuty")
                    ? " - 송달료만"
                    : domains.includes("lawyerFee")
                      ? ""
                      : " - 변호사보수 산입 외";
                  return (
                    <option key={value} value={value}>
                      {meta.nameKo} ({caseCode(value)}){suffix}
                    </option>
                  );
                })}
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              소가 산정 기준
              <Select
                value={caseValueBasis}
                disabled={!stampDutyApplies}
                onChange={(e) => setCaseValueBasis(e.target.value as CaseValueBasis)}
              >
                <option value="amount">금액으로 산출</option>
                <option value="unascertainable">
                  소가 산출 불가 또는 비재산권 소송 (5,000만원 간주)
                </option>
                <option value="unascertainableHighTier">
                  회사관계·특허·무체재산권 등 (1억원 간주)
                </option>
              </Select>
            </label>
            {caseValueBasis !== "amount" ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                「민사소송 등 인지규칙」제18조의2에 따라 소가를 간주합니다. 입력한 소가 금액은
                인지대·변호사보수 산정에 쓰이지 않습니다.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                소가
                <Input
                  value={formatWonInput(caseValueText)}
                  inputMode="numeric"
                  placeholder="예: 30,000,000"
                  // 인지 산출 외 사건구분은 소가가 결과에 쓰이지 않는다. 편집 가능한 채로
                  // 두면 금액을 넣고도 인지대가 0원이라 계산이 잘못된 것으로 읽힌다.
                  disabled={caseValueBasis !== "amount" || !stampDutyApplies}
                  onChange={(e) => setCaseValueText(parseWonText(e.target.value))}
                />
                <FieldError
                  message={
                    caseValueBasis === "amount" && stampDutyApplies
                      ? caseValueParsed(caseValueText).error
                      : undefined
                  }
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                당사자수
                <Input
                  value={partyCountText}
                  inputMode="numeric"
                  onChange={(e) => setPartyCountText(e.target.value)}
                />
                <FieldError message={parseNumberText(partyCountText, PARTY_COUNT_FORMAT).error} />
              </label>
            </div>
            {deliveryFormula.kind === "baseCountPlusCreditorMultiple" ? (
              <label className="grid gap-2 text-sm font-medium">
                채권자수
                <Input
                  value={creditorCountText}
                  inputMode="numeric"
                  onChange={(e) => setCreditorCountText(e.target.value)}
                />
                <FieldError
                  message={parseNumberText(creditorCountText, CREDITOR_COUNT_FORMAT).error}
                />
                <span className="text-xs font-normal text-muted-foreground">
                  송달 횟수 = 기본 {deliveryFormula.baseCount}회 + 채권자수 ×{" "}
                  {deliveryFormula.creditorMultiple}회
                </span>
              </label>
            ) : null}
            {deliveryFormula.kind === "perPartyPlusExtra" ? (
              <label className="grid gap-2 text-sm font-medium">
                우편 조회대상 기관수
                <Input
                  value={inquiredInstitutionsText}
                  inputMode="numeric"
                  onChange={(e) => setInquiredInstitutionsText(e.target.value)}
                />
                <FieldError
                  message={
                    parseNumberText(inquiredInstitutionsText, INSTITUTION_COUNT_FORMAT).error
                  }
                />
                <span className="text-xs font-normal text-muted-foreground">
                  우편에 의하여 재산조회를 실시하는 기관 수만큼 송달 횟수에 가산합니다. 해당 없으면
                  0.
                </span>
              </label>
            ) : null}
            {deliveryFormula.kind === "range" ? (
              <label className="grid gap-2 text-sm font-medium">
                송달 횟수 직접 입력
                <Input
                  value={deliveryCountText}
                  inputMode="numeric"
                  placeholder={`${deliveryFormula.countMin} ~ ${deliveryFormula.countMax}`}
                  onChange={(e) => setDeliveryCountText(e.target.value)}
                />
                <FieldError
                  message={parseNumberText(deliveryCountText, DELIVERY_COUNT_FORMAT).error}
                />
                <span className="text-xs font-normal text-muted-foreground">
                  이 사건구분은 정본 기준이 {deliveryFormula.countMin}~{deliveryFormula.countMax}회
                  범위라 단일 값이 정해져 있지 않습니다. 비워 두면 하한(
                  {deliveryFormula.countMin}회)으로 계산합니다.
                </span>
              </label>
            ) : null}
            {stampDutyApplies ? (
              <>
                <CaseValueEstimator
                  onApply={(value) => {
                    setCaseValueText(String(value));
                    setCaseValueBasis("amount");
                  }}
                />
                <ClaimAmendmentPanel
                  caseType={caseType}
                  isElectronicFiling={isElectronicFiling}
                  filingDate={filingDate}
                />
              </>
            ) : null}
            {!stampDutyApplies ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                이 사건구분은 「민사소송 등 인지법」제2조의 누진 산식 대상이 아닙니다. 인지액은 별도
                예규가 정하는 정액이라 계산하지 않고 0원으로 두며, 송달료만 산출합니다.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                심급
                <Select
                  value={appealsLevel}
                  disabled={
                    isProvisionalCase || paymentOrderApplies || isMediationCase || !stampDutyApplies
                  }
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
                  placeholder="비워 두면 소가와 동일"
                  disabled={
                    appealsLevel === "firstInstance" ||
                    isProvisionalCase ||
                    paymentOrderApplies ||
                    isMediationCase ||
                    // 간주 소가는 엔진이 소가를 통째로 대체하므로 불복 범위를 고쳐도 결과가
                    // 바뀌지 않는다. 편집 가능한 채로 두면 반영된다고 믿게 된다.
                    caseValueBasis !== "amount" ||
                    !stampDutyApplies
                  }
                  onChange={(e) => setAppealValueText(parseWonText(e.target.value))}
                />
              </label>
            </div>
            {isInterlocutoryAppealCase ? (
              <label className="grid gap-2 text-sm font-medium">
                원신청서 인지액 (인지법 제11조 제1항)
                <Input
                  value={formatWonInput(underlyingStampDutyText)}
                  inputMode="numeric"
                  placeholder="비워 두면 제11조 제2항 정액 2,000원"
                  onChange={(e) => setUnderlyingStampDutyText(parseWonText(e.target.value))}
                />
                <span className="text-xs font-normal text-muted-foreground">
                  제9조·제10조의 신청에 관한 재판에 대한 항고장·상소장은 그 신청서에 붙인 인지액의
                  2배입니다. 그 밖의 항고장은 비워 두세요.
                </span>
              </label>
            ) : null}
            {isProvisionalCase ? (
              <label className="grid gap-2 text-sm font-medium">
                보전처분 종류 (인지법 제9조 제2항)
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
                  disabled={!stampDutyApplies}
                  onChange={(e) => setIsElectronicFiling(e.target.checked)}
                />
                전자소송
              </label>
              {isPaymentOrderCase ? (
                <p className="text-xs text-muted-foreground">
                  독촉사건(지급명령)은 인지법 제7조 제2항에 따라 소장 인지의 1/10이 자동 적용됩니다.
                </p>
              ) : null}
              {legacyPaymentOrder && !isProvisionalCase ? (
                <div className="flex items-start justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  <span>
                    이전 버전에서 지급명령 인지대 감액(제7조 제2항 1/10)이 적용된 상태로 저장된
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
                  disabled={isProvisionalCase || paymentOrderApplies || !stampDutyApplies}
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
                선택한 사건구분은 「변호사보수의 소송비용 산입에 관한 규칙」 제3조 제1항 본안 사건에
                해당하지 않아 변호사보수가 산입되지 않습니다. 인지대·송달료만 계산됩니다.
              </div>
            ) : null}
            <fieldset disabled={!lawyerFeeApplies} className="grid gap-3 disabled:opacity-60">
              <label className="grid gap-2 font-medium">
                지급보수액 (실제 약정보수, 제3조 제1항)
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
                    가압류·가처분 사건은 제3조 제2항 본문에 따라 별표 산정액의 1/2이 자동
                    적용됩니다.
                  </p>
                  <label className="grid gap-2 text-sm font-medium">
                    사건 성격 (제3조 제2항 단서)
                    <Select
                      value={provisionalApplicationKind}
                      onChange={(e) =>
                        setProvisionalApplicationKind(e.target.value as ProvisionalApplicationKind)
                      }
                    >
                      <option value="unspecified">지정하지 않음 (본문 1/2만 적용)</option>
                      <option value="applicationWithHearing">
                        신청사건 · 변론 또는 심문을 거침 (1/2 산입)
                      </option>
                      <option value="applicationWithoutHearing">
                        신청사건 · 변론·심문을 거치지 않음 (산입 불가)
                      </option>
                      <option value="objectionOrCancellation">
                        이의 또는 취소 신청사건 (1/2 산입, 단서 대상 아님)
                      </option>
                    </Select>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    제3조 제2항 단서는 가압류·가처분 명령의 <strong>신청사건</strong>에만
                    적용됩니다. 이의·취소 신청사건은 변론·심문 여부와 무관하게 1/2이 산입됩니다.
                  </p>
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
                  <FieldError
                    message={
                      useCourtMultiplier ? parseNumberText(courtMultiplierText).error : undefined
                    }
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
                  <FieldError
                    message={useCustomRate ? parseNumberText(customRateText).error : undefined}
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
                <FieldError message={proportionalValuesError(proportionalValuesText)} />
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
                resultReady={resultReady}
                onClick={handleExportPdf}
              />
              <ActionButton
                action="csv"
                icon={FileSpreadsheet}
                label="CSV"
                loadingAction={loadingAction}
                requiresResult
                resultReady={resultReady}
                onClick={handleExportCsv}
              />
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
