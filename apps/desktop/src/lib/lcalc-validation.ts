import type {
  CalcOptions,
  HeirNode,
  InheritanceInput,
  InheritanceResult,
  InterestInput,
  LegalRateCode,
  RateSegment,
} from "@lawcalc-kr/core-engine";

import type { LcalcFile, LcalcInheritancePayload, LcalcInterestPayload } from "./ipc";

export type LoadedLegalRatePreset = LegalRateCode | "custom";

type UnknownLcalcEnvelope = { schemaVersion: "2"; kind: string; payload: unknown };

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
      `.lcalc 파일의 ${field} 필드가 너무 깁니다. 최대 ${MAX_NOTE_LENGTH.toLocaleString("en-US")}자까지 허용됩니다.`,
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`.lcalc 파일의 ${field} 필드가 올바르지 않습니다.`);
  }

  return value;
}

function requirePositiveNumber(value: unknown, field: string) {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new Error(`.lcalc 파일의 ${field} 필드는 0보다 큰 숫자여야 합니다.`);
  }

  return value;
}

function unsupportedKindMessage(kind: string) {
  return `이 파일의 계산 유형(${kind})은 현재 버전에서 지원하지 않습니다. 앱을 업데이트한 뒤 다시 시도해 주세요.`;
}

function requireRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new Error(`.lcalc 파일의 ${field} 필드가 올바르지 않습니다.`);
  }

  return value;
}

function parseHeirNode(value: unknown, field: string): HeirNode {
  const record = requireRecord(value, field);
  const name = record.name;
  const deceasedBeforeOpening = record.deceasedBeforeOpening;
  const representatives = record.representatives;

  if (name !== undefined && typeof name !== "string") {
    throw new Error(`.lcalc 파일의 ${field}.name 필드가 올바르지 않습니다.`);
  }
  if (typeof deceasedBeforeOpening !== "boolean") {
    throw new Error(`.lcalc 파일의 ${field}.deceasedBeforeOpening 필드가 올바르지 않습니다.`);
  }

  const node: HeirNode = {
    ...(typeof name === "string" ? { name } : {}),
    deceasedBeforeOpening,
  };

  if (representatives !== undefined) {
    if (!Array.isArray(representatives)) {
      throw new Error(`.lcalc 파일의 ${field}.representatives 필드가 올바르지 않습니다.`);
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
    throw new Error(`.lcalc 파일의 ${field} 필드가 올바르지 않습니다.`);
  }
  return value.map((heir, index) => parseHeirNode(heir, `${field}[${index}]`));
}

function parseInterestPayload(file: LcalcFile | UnknownLcalcEnvelope): LcalcInterestPayload {
  if (file.kind !== "interest") {
    if (file.kind === "inheritance") {
      throw new Error("상속 .lcalc 파일은 상속분 계산 탭에서 열어 주세요.");
    }

    throw new Error(unsupportedKindMessage(file.kind));
  }

  const payload = requireRecord(file.payload, "payload");

  if (!isRecord(payload.result)) {
    throw new Error(".lcalc 파일의 payload.result 필드가 올바르지 않습니다.");
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
    throw new Error(".lcalc 파일의 payload.result.shares 필드가 올바르지 않습니다.");
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

    throw new Error(unsupportedKindMessage(file.kind));
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
      throw new Error(".lcalc 파일의 payload.input.spouse.name 필드가 올바르지 않습니다.");
    }
    if (typeof spouseRecord.alive !== "boolean") {
      throw new Error(".lcalc 파일의 payload.input.spouse.alive 필드가 올바르지 않습니다.");
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

export function validateLcalcEnvelope(file: LcalcFile | UnknownLcalcEnvelope): void {
  if (file.schemaVersion !== "2") {
    throw new Error(
      ".lcalc 파일 형식이 올바르지 않습니다. 파일을 새로 저장한 뒤 다시 열어 주세요.",
    );
  }

  if (file.kind === "interest") {
    void parseInterestPayload(file);
    return;
  }

  if (file.kind === "inheritance") {
    void parseInheritancePayload(file);
    return;
  }

  throw new Error(unsupportedKindMessage(file.kind));
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
    throw new Error(".lcalc 파일의 options.mode 필드가 올바르지 않습니다.");
  }

  if (typeof leapYear !== "string" || !leapYearModes.has(leapYear as CalcOptions["leapYear"])) {
    throw new Error(".lcalc 파일의 options.leapYear 필드가 올바르지 않습니다.");
  }

  if (typeof includeFirstDay !== "boolean") {
    throw new Error(".lcalc 파일의 options.includeFirstDay 필드가 올바르지 않습니다.");
  }

  if (
    rounding !== undefined &&
    (typeof rounding !== "string" ||
      !roundingModes.has(rounding as NonNullable<CalcOptions["rounding"]>))
  ) {
    throw new Error(".lcalc 파일의 options.rounding 필드가 올바르지 않습니다.");
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
    throw new Error(".lcalc 파일의 segments 필드가 올바르지 않습니다.");
  }

  return value.map((segment, index) => {
    if (!isRecord(segment)) {
      throw new Error(`.lcalc 파일의 segments[${index}] 필드가 올바르지 않습니다.`);
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
    throw new Error(".lcalc 파일의 legalRatePreset 필드가 올바르지 않습니다.");
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
