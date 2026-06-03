import {
  appliedDomains,
  validateAppropriationInput,
  validateDeliveryFeeInput,
  validateLawyerFeeInput,
  validateStampDutyInput,
  type AppropriationInput,
  type AppropriationResult,
  type CalcOptions,
  type CaseType,
  type HeirNode,
  type InheritanceInput,
  type InheritanceResult,
  type InterestInput,
  type LegalRateCode,
  type LitigationCostInput,
  type LitigationCostResult,
  type RateSegment,
} from "@lawcalc-kr/core-engine";
import {
  validateCompensationDeathInput,
  validateCompensationInput,
  type CompensationAutoDeathInput,
  type CompensationAutoDeathResult,
  type CompensationInput,
  type CompensationResult,
} from "@lawcalc-kr/compensation";

import type {
  LcalcAppropriationPayload,
  LcalcCompensationInput,
  LcalcCompensationPayload,
  LcalcCompensationResult,
  LcalcFile,
  LcalcInheritancePayload,
  LcalcInterestPayload,
  LcalcLitigationCostPayload,
} from "./ipc";

export type LoadedLegalRatePreset = LegalRateCode | "custom";

type UnknownLcalcEnvelope = {
  schemaVersion: "3";
  kind: string;
  envelopeFeatures: string[];
  dataVersions: Record<string, string>;
  payload: unknown;
};

/**
 * v3 envelope 가 reader 호환성 검증 (fast-reject) 에 사용하는 capability id
 * 화이트리스트. capability id = `"{domain}@{engineMajor}"` 형식. v0.3.0 시점
 * 단일 도메인 capability 만 보유하며, litigation-cost 등 향후 도메인 추가 시
 * 본 set 에 합류한다.
 */
const SUPPORTED_LCALC_CAPABILITIES = new Set<string>([
  "interest@1",
  "inheritance@1",
  "litigation-cost@1",
  "appropriation@1",
  "compensation@1",
  "compensation@2",
  "compensation@3",
  "compensation@4",
]);

const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9-]*@[1-9][0-9]*$/;

interface ParsedLcalcInput {
  input: InterestInput;
  preset: LoadedLegalRatePreset;
  customRate: number;
  result: LcalcInterestPayload["result"];
  note?: string;
}

interface ParsedInheritanceLcalcInput {
  input: InheritanceInput;
  result?: InheritanceResult;
  note?: string;
}

interface ParsedLitigationCostLcalcInput {
  input: LitigationCostInput;
  result?: LitigationCostResult;
  note?: string;
}

interface ParsedAppropriationLcalcInput {
  input: AppropriationInput;
  result?: AppropriationResult;
  note?: string;
}

interface ParsedCompensationLcalcInput {
  input: LcalcCompensationInput;
  result?: LcalcCompensationResult;
  note?: string;
}

const legalRateCodes = new Set<LegalRateCode>(["civil", "commercial", "promotion"]);
const optionModes = new Set<CalcOptions["mode"]>(["period", "totalDays"]);
const leapYearModes = new Set<CalcOptions["leapYear"]>(["fixed365", "actual"]);
const roundingModes = new Set<NonNullable<CalcOptions["rounding"]>>(["floor", "ceil", "round"]);

/**
 * Note 필드 최대 길이 (UTF-16 code units, 즉 JS string length).
 * 사용자 입력 자유 텍스트가 .lcalc 파일을 통해 무제한으로 들어와 메모리/렌더링
 * 비용을 비대화시키는 것을 막기 위한 가드. 한글 1글자 = 1 code unit (BMP)
 * 이므로 한글 기준 약 10,000자까지 허용.
 */
export const MAX_NOTE_LENGTH = 10_000;

function requireBoundedNote(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  if (value.length > MAX_NOTE_LENGTH) {
    throw new Error(
      `.lcalc 파일의 ${field} 필드가 너무 깁니다. 최대 ${MAX_NOTE_LENGTH.toLocaleString("ko-KR")}자까지 허용됩니다.`,
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLegacyLawyerFeeDiscount(discount: unknown): unknown {
  if (!isRecord(discount)) {
    return discount;
  }
  if (discount.kind === "klac") {
    return { ...discount, kind: "koreaLegalAid" };
  }
  return discount;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`.lcalc 파일의 ${field} 필드는 비어 있지 않은 문자열이어야 합니다.`);
  }

  return value;
}

function requirePositiveNumber(value: unknown, field: string) {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new Error(`.lcalc 파일의 ${field} 필드는 0보다 큰 숫자여야 합니다.`);
  }

  return value;
}

function requireNonNegativeNumber(value: unknown, field: string) {
  if (!isFiniteNumber(value) || value < 0) {
    throw new Error(`.lcalc 파일의 ${field} 필드는 0 이상 숫자여야 합니다.`);
  }

  return value;
}

function optionalBoolean(record: Record<string, unknown>, key: string, field: string) {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`.lcalc 파일의 ${field} 필드는 true 또는 false 여야 합니다.`);
  }
  return value;
}

function unsupportedCapabilityMessage(capabilityId: string) {
  return `이 파일에는 ${capabilityId} 기능이 필요합니다. 앱을 업데이트한 뒤 다시 시도해 주세요.`;
}

function requireRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new Error(`.lcalc 파일의 ${field} 필드는 객체여야 합니다.`);
  }

  return value;
}

function parseHeirNode(value: unknown, field: string): HeirNode {
  const record = requireRecord(value, field);
  const name = record.name;
  const deceasedBeforeOpening = record.deceasedBeforeOpening;
  const representatives = record.representatives;

  if (name !== undefined && typeof name !== "string") {
    throw new Error(`.lcalc 파일의 ${field}.name 필드는 문자열이어야 합니다.`);
  }
  if (typeof deceasedBeforeOpening !== "boolean") {
    throw new Error(
      `.lcalc 파일의 ${field}.deceasedBeforeOpening 필드는 true 또는 false 여야 합니다.`,
    );
  }

  const node: HeirNode = {
    ...(typeof name === "string" ? { name } : {}),
    deceasedBeforeOpening,
  };

  if (representatives !== undefined) {
    if (!Array.isArray(representatives)) {
      throw new Error(`.lcalc 파일의 ${field}.representatives 필드는 배열이어야 합니다.`);
    }
    node.representatives = representatives.map((representative, index) =>
      parseHeirNode(representative, `${field}.representatives[${index}]`),
    );
  }

  return node;
}

function parseHeirGroup(value: unknown, field: string): HeirNode[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`.lcalc 파일의 ${field} 필드는 배열이어야 합니다.`);
  }
  return value.map((heir, index) => parseHeirNode(heir, `${field}[${index}]`));
}

function parseInterestPayload(file: LcalcFile | UnknownLcalcEnvelope): LcalcInterestPayload {
  if (file.kind !== "interest") {
    if (file.kind === "inheritance") {
      throw new Error("상속 .lcalc 파일은 상속분 계산 탭에서 열어 주세요.");
    }

    throw new Error(unsupportedCapabilityMessage(`${file.kind}@1`));
  }

  const payload = requireRecord(file.payload, "payload");

  if (!isRecord(payload.result)) {
    throw new Error(".lcalc 파일의 payload.result 필드는 객체여야 합니다.");
  }

  const note = requireBoundedNote(payload.note, "payload.note");

  return {
    appVersion: requireString(payload.appVersion, "payload.appVersion"),
    dataVersion: requireString(payload.dataVersion, "payload.dataVersion"),
    createdAt: requireString(payload.createdAt, "payload.createdAt"),
    input: payload.input as InterestInput,
    options: parseOptions(payload.options),
    result: payload.result as unknown as LcalcInterestPayload["result"],
    ...(note === undefined ? {} : { note }),
    disclaimer: requireString(payload.disclaimer, "payload.disclaimer"),
  };
}

function parseInheritanceResult(value: unknown): InheritanceResult {
  const result = requireRecord(value, "payload.result");
  const decedent = requireRecord(result.decedent, "payload.result.decedent");
  const shares = result.shares;

  if (!Array.isArray(shares)) {
    throw new Error(".lcalc 파일의 payload.result.shares 필드는 배열이어야 합니다.");
  }

  return {
    decedent: {
      ...(typeof decedent.name === "string" ? { name: decedent.name } : {}),
      deceasedAt: requireString(decedent.deceasedAt, "payload.result.decedent.deceasedAt"),
    },
    shares: shares.map((share, index) => {
      const record = requireRecord(share, `payload.result.shares[${index}]`);
      return {
        name: requireString(record.name, `payload.result.shares[${index}].name`),
        numerator: requirePositiveNumber(
          record.numerator,
          `payload.result.shares[${index}].numerator`,
        ),
        denominator: requirePositiveNumber(
          record.denominator,
          `payload.result.shares[${index}].denominator`,
        ),
        rawNumerator: requirePositiveNumber(
          record.rawNumerator,
          `payload.result.shares[${index}].rawNumerator`,
        ),
        rawDenominator: requirePositiveNumber(
          record.rawDenominator,
          `payload.result.shares[${index}].rawDenominator`,
        ),
      };
    }),
    disclaimer: requireString(result.disclaimer, "payload.result.disclaimer"),
    dataVersion: requireString(result.dataVersion, "payload.result.dataVersion"),
    computedAt: requireString(result.computedAt, "payload.result.computedAt"),
  };
}

function parseInheritancePayload(file: LcalcFile | UnknownLcalcEnvelope): LcalcInheritancePayload {
  if (file.kind !== "inheritance") {
    if (file.kind === "interest") {
      throw new Error("이자 .lcalc 파일은 이자 계산 탭에서 열어 주세요.");
    }

    throw new Error(unsupportedCapabilityMessage(`${file.kind}@1`));
  }

  const payload = requireRecord(file.payload, "payload");
  const input = requireRecord(payload.input, "payload.input");
  const decedent = requireRecord(input.decedent, "payload.input.decedent");
  const spouse = input.spouse;
  const spouseRecord =
    spouse === undefined ? undefined : requireRecord(spouse, "payload.input.spouse");
  const linealDescendants = parseHeirGroup(
    input.linealDescendants,
    "payload.input.linealDescendants",
  );
  const linealAscendants = parseHeirGroup(input.linealAscendants, "payload.input.linealAscendants");
  const siblings = parseHeirGroup(input.siblings, "payload.input.siblings");
  const collateralFourth = parseHeirGroup(input.collateralFourth, "payload.input.collateralFourth");

  if (spouseRecord !== undefined) {
    if (spouseRecord.name !== undefined && typeof spouseRecord.name !== "string") {
      throw new Error(".lcalc 파일의 payload.input.spouse.name 필드는 문자열이어야 합니다.");
    }
    if (typeof spouseRecord.alive !== "boolean") {
      throw new Error(
        ".lcalc 파일의 payload.input.spouse.alive 필드는 true 또는 false 여야 합니다.",
      );
    }
  }

  const inheritanceInput: InheritanceInput = {
    decedent: {
      ...(typeof decedent.name === "string" ? { name: decedent.name } : {}),
      deceasedAt: requireString(decedent.deceasedAt, "payload.input.decedent.deceasedAt"),
    },
    ...(spouseRecord === undefined
      ? {}
      : {
          spouse: {
            ...(typeof spouseRecord.name === "string" ? { name: spouseRecord.name } : {}),
            alive: spouseRecord.alive as boolean,
          },
        }),
    ...(linealDescendants === undefined ? {} : { linealDescendants }),
    ...(linealAscendants === undefined ? {} : { linealAscendants }),
    ...(siblings === undefined ? {} : { siblings }),
    ...(collateralFourth === undefined ? {} : { collateralFourth }),
  };

  const note = requireBoundedNote(payload.note, "payload.note");

  return {
    appVersion: requireString(payload.appVersion, "payload.appVersion"),
    dataVersion: requireString(payload.dataVersion, "payload.dataVersion"),
    createdAt: requireString(payload.createdAt, "payload.createdAt"),
    input: inheritanceInput,
    ...(payload.result === undefined ? {} : { result: parseInheritanceResult(payload.result) }),
    ...(note === undefined ? {} : { note }),
    disclaimer: requireString(payload.disclaimer, "payload.disclaimer"),
  };
}

function parseLitigationCostInput(value: unknown): LitigationCostInput {
  const input = requireRecord(value, "payload.input");
  const stampDutyRecord = requireRecord(input.stampDuty, "payload.input.stampDuty");
  const deliveryRecord = requireRecord(input.deliveryFee, "payload.input.deliveryFee");
  const lawyerRecord = requireRecord(input.lawyerFee, "payload.input.lawyerFee");
  const isPaymentOrder = optionalBoolean(
    stampDutyRecord,
    "isPaymentOrder",
    "payload.input.stampDuty.isPaymentOrder",
  );
  const isSettlement = optionalBoolean(
    stampDutyRecord,
    "isSettlement",
    "payload.input.stampDuty.isSettlement",
  );
  const isElectronicFiling = optionalBoolean(
    stampDutyRecord,
    "isElectronicFiling",
    "payload.input.stampDuty.isElectronicFiling",
  );
  const isRetrial = optionalBoolean(
    stampDutyRecord,
    "isRetrial",
    "payload.input.stampDuty.isRetrial",
  );

  const stampDuty: LitigationCostInput["stampDuty"] = {
    caseValue: requireNonNegativeNumber(
      stampDutyRecord.caseValue,
      "payload.input.stampDuty.caseValue",
    ),
    caseType: requireString(
      stampDutyRecord.caseType,
      "payload.input.stampDuty.caseType",
    ) as CaseType,
    appealsLevel: requireString(
      stampDutyRecord.appealsLevel,
      "payload.input.stampDuty.appealsLevel",
    ) as LitigationCostInput["stampDuty"]["appealsLevel"],
    ...(isPaymentOrder === undefined ? {} : { isPaymentOrder }),
    ...(isSettlement === undefined ? {} : { isSettlement }),
    ...(isElectronicFiling === undefined ? {} : { isElectronicFiling }),
    ...(isRetrial === undefined ? {} : { isRetrial }),
  };
  validateStampDutyInput(stampDuty);

  const deliveryFee: LitigationCostInput["deliveryFee"] = {
    caseType: requireString(
      deliveryRecord.caseType,
      "payload.input.deliveryFee.caseType",
    ) as CaseType,
    partyCount: requirePositiveNumber(
      deliveryRecord.partyCount,
      "payload.input.deliveryFee.partyCount",
    ),
    ...(deliveryRecord.creditorCount === undefined
      ? {}
      : {
          creditorCount: requireNonNegativeNumber(
            deliveryRecord.creditorCount,
            "payload.input.deliveryFee.creditorCount",
          ),
        }),
    ...(deliveryRecord.customCount === undefined
      ? {}
      : {
          customCount: requirePositiveNumber(
            deliveryRecord.customCount,
            "payload.input.deliveryFee.customCount",
          ),
        }),
    ...(deliveryRecord.perDeliveryUnitPriceWon === undefined
      ? {}
      : {
          perDeliveryUnitPriceWon: requireNonNegativeNumber(
            deliveryRecord.perDeliveryUnitPriceWon,
            "payload.input.deliveryFee.perDeliveryUnitPriceWon",
          ),
        }),
    ...(deliveryRecord.filingDate === undefined
      ? {}
      : {
          filingDate: requireString(
            deliveryRecord.filingDate,
            "payload.input.deliveryFee.filingDate",
          ),
        }),
  };
  validateDeliveryFeeInput(deliveryFee);

  const discounts = lawyerRecord.discounts;
  if (!Array.isArray(discounts)) {
    throw new Error(".lcalc 파일의 payload.input.lawyerFee.discounts 필드는 배열이어야 합니다.");
  }
  const normalizedDiscounts = discounts.map(normalizeLegacyLawyerFeeDiscount);
  const koreaLegalAidAgreedFeeWon =
    lawyerRecord.koreaLegalAidAgreedFeeWon ?? lawyerRecord.klacAgreedFeeWon;
  const lawyerFee: LitigationCostInput["lawyerFee"] = {
    caseValue: requireNonNegativeNumber(
      lawyerRecord.caseValue,
      "payload.input.lawyerFee.caseValue",
    ),
    caseType: requireString(lawyerRecord.caseType, "payload.input.lawyerFee.caseType") as CaseType,
    discounts: normalizedDiscounts as LitigationCostInput["lawyerFee"]["discounts"],
    ...(koreaLegalAidAgreedFeeWon === undefined
      ? {}
      : {
          koreaLegalAidAgreedFeeWon: requireNonNegativeNumber(
            koreaLegalAidAgreedFeeWon,
            "payload.input.lawyerFee.koreaLegalAidAgreedFeeWon",
          ),
        }),
    ...(lawyerRecord.filingDate === undefined
      ? {}
      : {
          filingDate: requireString(lawyerRecord.filingDate, "payload.input.lawyerFee.filingDate"),
        }),
  };
  if (appliedDomains(lawyerFee.caseType).includes("lawyerFee")) {
    validateLawyerFeeInput(lawyerFee);
  }

  const distributionValue = input.distribution;
  if (distributionValue === undefined) {
    return { stampDuty, deliveryFee, lawyerFee };
  }
  const distributionRecord = requireRecord(distributionValue, "payload.input.distribution");
  const mode = requireString(distributionRecord.mode, "payload.input.distribution.mode");
  if (mode === "equal") {
    return {
      stampDuty,
      deliveryFee,
      lawyerFee,
      distribution: {
        mode,
        ...(distributionRecord.partyCount === undefined
          ? {}
          : {
              partyCount: requirePositiveNumber(
                distributionRecord.partyCount,
                "payload.input.distribution.partyCount",
              ),
            }),
      },
    };
  }
  if (mode === "proportional") {
    if (!Array.isArray(distributionRecord.partyValuesWon)) {
      throw new Error(
        ".lcalc 파일의 payload.input.distribution.partyValuesWon 필드는 배열이어야 합니다.",
      );
    }
    return {
      stampDuty,
      deliveryFee,
      lawyerFee,
      distribution: {
        mode,
        partyValuesWon: distributionRecord.partyValuesWon.map((value, index) =>
          requirePositiveNumber(value, `payload.input.distribution.partyValuesWon[${index}]`),
        ),
      },
    };
  }

  throw new Error(
    '.lcalc 파일의 payload.input.distribution.mode 필드는 "equal" 또는 "proportional" 이어야 합니다.',
  );
}

function requireLitigationCostDataVersions(dataVersions: Record<string, string>): void {
  for (const key of ["stamp-duty", "delivery", "lawyer-fee"] as const) {
    if (typeof dataVersions[key] !== "string" || dataVersions[key].length === 0) {
      throw new Error(
        `.lcalc 파일의 dataVersions["${key}"] 필드는 비어 있지 않은 문자열이어야 합니다.`,
      );
    }
  }
}

function parseLitigationCostResult(value: unknown): LitigationCostResult {
  const result = requireRecord(value, "payload.result");
  requireRecord(result.stampDuty, "payload.result.stampDuty");
  requireRecord(result.deliveryFee, "payload.result.deliveryFee");
  requireRecord(result.lawyerFee, "payload.result.lawyerFee");
  const dataVersions = validateDataVersions(result.dataVersions);
  requireLitigationCostDataVersions(dataVersions);

  return {
    ...(result as unknown as LitigationCostResult),
    disclaimer: requireString(result.disclaimer, "payload.result.disclaimer"),
    dataVersions,
    computedAt: requireString(result.computedAt, "payload.result.computedAt"),
    totalAmount: requireNonNegativeNumber(result.totalAmount, "payload.result.totalAmount"),
  };
}

function parseLitigationCostPayload(
  file: LcalcFile | UnknownLcalcEnvelope,
): LcalcLitigationCostPayload {
  if (file.kind !== "litigation-cost") {
    if (file.kind === "interest") {
      throw new Error("이자 .lcalc 파일은 이자 계산 탭에서 열어 주세요.");
    }
    if (file.kind === "inheritance") {
      throw new Error("상속 .lcalc 파일은 상속분 계산 탭에서 열어 주세요.");
    }

    throw new Error(unsupportedCapabilityMessage(`${file.kind}@1`));
  }

  requireLitigationCostDataVersions(validateDataVersions(file.dataVersions));
  const payload = requireRecord(file.payload, "payload");
  const note = requireBoundedNote(payload.note, "payload.note");

  return {
    appVersion: requireString(payload.appVersion, "payload.appVersion"),
    createdAt: requireString(payload.createdAt, "payload.createdAt"),
    input: parseLitigationCostInput(payload.input),
    ...(payload.result === undefined ? {} : { result: parseLitigationCostResult(payload.result) }),
    ...(note === undefined ? {} : { note }),
    disclaimer: requireString(payload.disclaimer, "payload.disclaimer"),
  };
}

function parseAppropriationInput(value: unknown): AppropriationInput {
  const input = requireRecord(value, "payload.input");
  // 본 validator 는 core-engine 의 Korean RangeError 분기에 위임.
  // 즉 .lcalc envelope 측은 raw shape 만 받고 도메인 validator 가 invariant 강제.
  validateAppropriationInput(input as unknown as AppropriationInput);
  return input as unknown as AppropriationInput;
}

function parseAppropriationResult(value: unknown): AppropriationResult {
  const result = requireRecord(value, "payload.result");
  return {
    ...(result as unknown as AppropriationResult),
    disclaimer: requireString(result.disclaimer, "payload.result.disclaimer"),
    dataVersion: requireString(result.dataVersion, "payload.result.dataVersion"),
    computedAt: requireString(result.computedAt, "payload.result.computedAt"),
  };
}

function parseAppropriationPayload(
  file: LcalcFile | UnknownLcalcEnvelope,
): LcalcAppropriationPayload {
  if (file.kind !== "appropriation") {
    if (file.kind === "interest") {
      throw new Error("이자 .lcalc 파일은 이자 계산 탭에서 열어 주세요.");
    }
    if (file.kind === "inheritance") {
      throw new Error("상속 .lcalc 파일은 상속분 계산 탭에서 열어 주세요.");
    }
    if (file.kind === "litigation-cost") {
      throw new Error("소송비용 .lcalc 파일은 소송비용 탭에서 열어 주세요.");
    }

    throw new Error(unsupportedCapabilityMessage(`${file.kind}@1`));
  }

  const dataVersions = validateDataVersions(file.dataVersions);
  if (typeof dataVersions.appropriation !== "string" || dataVersions.appropriation.length === 0) {
    throw new Error(
      '.lcalc 파일의 dataVersions["appropriation"] 필드는 비어 있지 않은 문자열이어야 합니다.',
    );
  }
  const payload = requireRecord(file.payload, "payload");
  const note = requireBoundedNote(payload.note, "payload.note");

  return {
    appVersion: requireString(payload.appVersion, "payload.appVersion"),
    createdAt: requireString(payload.createdAt, "payload.createdAt"),
    input: parseAppropriationInput(payload.input),
    ...(payload.result === undefined ? {} : { result: parseAppropriationResult(payload.result) }),
    ...(note === undefined ? {} : { note }),
    disclaimer: requireString(payload.disclaimer, "payload.disclaimer"),
  };
}

function parseCompensationInput(value: unknown): LcalcCompensationInput {
  const input = requireRecord(value, "payload.input");
  // 도메인 validator (한국어 RangeError) 에 위임. envelope 측은 raw shape 만 받음.
  // `mode: "death"` discriminator 로 자×사망(`compensation@2`) / 자×부상(`compensation@1`) 분기.
  if (input.mode === "death") {
    validateCompensationDeathInput(input as unknown as CompensationAutoDeathInput);
    return input as unknown as CompensationAutoDeathInput;
  }
  validateCompensationInput(input as unknown as CompensationInput);
  return input as unknown as LcalcCompensationInput;
}

function parseCompensationResult(value: unknown): LcalcCompensationResult {
  const result = requireRecord(value, "payload.result");
  if (result.mode === "death") {
    return {
      ...(result as unknown as CompensationAutoDeathResult),
      disclaimer: requireString(
        result.disclaimer,
        "payload.result.disclaimer",
      ) as CompensationAutoDeathResult["disclaimer"],
      computedAt: requireString(result.computedAt, "payload.result.computedAt"),
    };
  }
  return {
    ...(result as unknown as CompensationResult),
    disclaimer: requireString(
      result.disclaimer,
      "payload.result.disclaimer",
    ) as CompensationResult["disclaimer"],
    computedAt: requireString(result.computedAt, "payload.result.computedAt"),
  };
}

function requireCompensationDataVersions(dataVersions: Record<string, string>): void {
  for (const key of ["laborRates", "lifeExpectancy", "hoffman", "leibniz"] as const) {
    if (typeof dataVersions[key] !== "string" || dataVersions[key].length === 0) {
      throw new Error(
        `.lcalc 파일의 dataVersions["${key}"] 필드는 비어 있지 않은 문자열이어야 합니다.`,
      );
    }
  }
}

function parseCompensationPayload(
  file: LcalcFile | UnknownLcalcEnvelope,
): LcalcCompensationPayload {
  if (file.kind !== "compensation") {
    if (file.kind === "interest") {
      throw new Error("이자 .lcalc 파일은 이자 계산 탭에서 열어 주세요.");
    }
    if (file.kind === "inheritance") {
      throw new Error("상속 .lcalc 파일은 상속분 계산 탭에서 열어 주세요.");
    }
    if (file.kind === "litigation-cost") {
      throw new Error("소송비용 .lcalc 파일은 소송비용 탭에서 열어 주세요.");
    }
    if (file.kind === "appropriation") {
      throw new Error("변제충당 .lcalc 파일은 변제충당 탭에서 열어 주세요.");
    }

    throw new Error(unsupportedCapabilityMessage(`${file.kind}@1`));
  }

  requireCompensationDataVersions(validateDataVersions(file.dataVersions));
  const payload = requireRecord(file.payload, "payload");
  const note = requireBoundedNote(payload.note, "payload.note");

  return {
    appVersion: requireString(payload.appVersion, "payload.appVersion"),
    createdAt: requireString(payload.createdAt, "payload.createdAt"),
    input: parseCompensationInput(payload.input),
    ...(payload.result === undefined ? {} : { result: parseCompensationResult(payload.result) }),
    ...(note === undefined ? {} : { note }),
    disclaimer: requireString(payload.disclaimer, "payload.disclaimer"),
  };
}

function validateEnvelopeFeatures(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      ".lcalc 파일의 envelopeFeatures 필드가 올바르지 않습니다. 파일을 새로 저장한 뒤 다시 열어 주세요.",
    );
  }

  return value.map((capabilityId, index) => {
    if (typeof capabilityId !== "string" || !CAPABILITY_ID_PATTERN.test(capabilityId)) {
      throw new Error(
        `.lcalc 파일의 envelopeFeatures[${index}] 필드는 capability id 형식이어야 합니다 (예: "interest@1").`,
      );
    }

    if (!SUPPORTED_LCALC_CAPABILITIES.has(capabilityId)) {
      throw new Error(unsupportedCapabilityMessage(capabilityId));
    }

    return capabilityId;
  });
}

function validateDataVersions(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error(".lcalc 파일의 dataVersions 필드는 객체여야 합니다.");
  }

  const result: Record<string, string> = {};
  for (const [domain, version] of Object.entries(value)) {
    if (typeof version !== "string" || version.length === 0) {
      throw new Error(
        `.lcalc 파일의 dataVersions["${domain}"] 필드는 비어 있지 않은 문자열이어야 합니다.`,
      );
    }
    result[domain] = version;
  }
  return result;
}

export function validateLcalcEnvelope(file: LcalcFile | UnknownLcalcEnvelope): void {
  if (file.schemaVersion !== "3") {
    throw new Error(
      ".lcalc 파일 형식이 올바르지 않습니다. 파일을 새로 저장한 뒤 다시 열어 주세요.",
    );
  }

  validateEnvelopeFeatures(file.envelopeFeatures);
  validateDataVersions(file.dataVersions);

  if (file.kind === "interest") {
    void parseInterestPayload(file);
    return;
  }

  if (file.kind === "inheritance") {
    void parseInheritancePayload(file);
    return;
  }

  if (file.kind === "litigation-cost") {
    void parseLitigationCostPayload(file);
    return;
  }

  if (file.kind === "appropriation") {
    void parseAppropriationPayload(file);
    return;
  }

  if (file.kind === "compensation") {
    void parseCompensationPayload(file);
    return;
  }

  throw new Error(unsupportedCapabilityMessage(`${file.kind}@1`));
}

function parseOptions(value: unknown): CalcOptions {
  if (!isRecord(value)) {
    throw new Error(".lcalc 파일의 options 필드가 없습니다.");
  }

  const mode = value.mode;
  const leapYear = value.leapYear;
  const includeFirstDay = value.includeFirstDay;
  const rounding = value.rounding;

  if (typeof mode !== "string" || !optionModes.has(mode as CalcOptions["mode"])) {
    throw new Error('.lcalc 파일의 options.mode 필드는 "period" 또는 "totalDays" 여야 합니다.');
  }

  if (typeof leapYear !== "string" || !leapYearModes.has(leapYear as CalcOptions["leapYear"])) {
    throw new Error(
      '.lcalc 파일의 options.leapYear 필드는 "fixed365" 또는 "actual" 이어야 합니다.',
    );
  }

  if (typeof includeFirstDay !== "boolean") {
    throw new Error(".lcalc 파일의 options.includeFirstDay 필드는 true 또는 false 여야 합니다.");
  }

  if (
    rounding !== undefined &&
    (typeof rounding !== "string" ||
      !roundingModes.has(rounding as NonNullable<CalcOptions["rounding"]>))
  ) {
    throw new Error(
      '.lcalc 파일의 options.rounding 필드는 "floor", "ceil", "round" 중 하나여야 합니다.',
    );
  }

  return {
    mode: mode as CalcOptions["mode"],
    leapYear: leapYear as CalcOptions["leapYear"],
    includeFirstDay,
    ...(rounding === undefined
      ? {}
      : { rounding: rounding as NonNullable<CalcOptions["rounding"]> }),
  };
}

function parseSegments(value: unknown): RateSegment[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(".lcalc 파일의 segments 필드는 배열이어야 합니다.");
  }

  return value.map((segment, index) => {
    if (!isRecord(segment)) {
      throw new Error(`.lcalc 파일의 segments[${index}] 필드는 객체여야 합니다.`);
    }

    return {
      from: requireString(segment.from, `segments[${index}].from`),
      to: requireString(segment.to, `segments[${index}].to`),
      rate: requirePositiveNumber(segment.rate, `segments[${index}].rate`),
    };
  });
}

export function parseLoadedLcalcInput(file: LcalcFile): ParsedLcalcInput {
  const payload = parseInterestPayload(file);
  const value: unknown = payload.input;

  if (!isRecord(value)) {
    throw new Error(".lcalc 파일의 input 필드가 없습니다.");
  }

  if (!Object.hasOwn(value, "legalRatePreset")) {
    throw new Error(".lcalc 파일에 legalRatePreset 필드가 없어 이율을 확인할 수 없습니다.");
  }

  const legalRatePreset = value.legalRatePreset;
  const options = parseOptions(value.options);
  const segments = parseSegments(value.segments);
  const baseInput = {
    principal: requirePositiveNumber(value.principal, "principal"),
    startDate: requireString(value.startDate, "startDate"),
    endDate: requireString(value.endDate, "endDate"),
    ...(segments === undefined ? {} : { segments }),
    options,
    ...(typeof value.note === "string" ? { note: value.note } : {}),
  };

  if (typeof legalRatePreset === "string" && legalRateCodes.has(legalRatePreset as LegalRateCode)) {
    return {
      input: { ...baseInput, legalRatePreset: legalRatePreset as LegalRateCode },
      preset: legalRatePreset as LegalRateCode,
      customRate: 0.05,
      result: payload.result,
      ...(payload.note === undefined ? {} : { note: payload.note }),
    };
  }

  if (!isRecord(legalRatePreset) || !Object.hasOwn(legalRatePreset, "customRate")) {
    throw new Error(
      '.lcalc 파일의 legalRatePreset 필드는 "civil", "commercial", "promotion" 중 하나이거나 customRate 를 가진 객체여야 합니다.',
    );
  }

  const customRate = requirePositiveNumber(
    legalRatePreset.customRate,
    "legalRatePreset.customRate",
  );

  return {
    input: { ...baseInput, legalRatePreset: { customRate } },
    preset: "custom",
    customRate,
    result: payload.result,
    ...(payload.note === undefined ? {} : { note: payload.note }),
  };
}

export function parseLoadedInheritanceLcalcInput(file: LcalcFile): ParsedInheritanceLcalcInput {
  const payload = parseInheritancePayload(file);
  return {
    input: payload.input,
    ...(payload.result === undefined ? {} : { result: payload.result }),
    ...(payload.note === undefined ? {} : { note: payload.note }),
  };
}

export function parseLoadedLitigationCostLcalcInput(
  file: LcalcFile,
): ParsedLitigationCostLcalcInput {
  const payload = parseLitigationCostPayload(file);
  return {
    input: payload.input,
    ...(payload.result === undefined ? {} : { result: payload.result }),
    ...(payload.note === undefined ? {} : { note: payload.note }),
  };
}

export function parseLoadedAppropriationLcalcInput(file: LcalcFile): ParsedAppropriationLcalcInput {
  const payload = parseAppropriationPayload(file);
  return {
    input: payload.input,
    ...(payload.result === undefined ? {} : { result: payload.result }),
    ...(payload.note === undefined ? {} : { note: payload.note }),
  };
}

export function parseLoadedCompensationLcalcInput(file: LcalcFile): ParsedCompensationLcalcInput {
  const payload = parseCompensationPayload(file);
  return {
    input: payload.input,
    ...(payload.result === undefined ? {} : { result: payload.result }),
    ...(payload.note === undefined ? {} : { note: payload.note }),
  };
}
