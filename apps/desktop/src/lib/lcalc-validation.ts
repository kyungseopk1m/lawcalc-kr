import type {
  CalcOptions,
  InterestInput,
  LegalRateCode,
  RateSegment,
} from "@lawcalc-kr/core-engine";

import type { LcalcFile } from "./ipc";

export type LoadedLegalRatePreset = LegalRateCode | "custom";

interface ParsedLcalcInput {
  input: InterestInput;
  preset: LoadedLegalRatePreset;
  customRate: number;
}

const legalRateCodes = new Set<LegalRateCode>(["civil", "commercial", "promotion"]);
const optionModes = new Set<CalcOptions["mode"]>(["period", "totalDays"]);
const leapYearModes = new Set<CalcOptions["leapYear"]>(["fixed365", "actual"]);
const roundingModes = new Set<NonNullable<CalcOptions["rounding"]>>(["floor", "ceil", "round"]);

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
  const value: unknown = file.input;

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
  };
}
