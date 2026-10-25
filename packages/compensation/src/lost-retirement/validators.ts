import type { IsoDate } from "@lawcalc-kr/core-engine";
import type { LostRetirementInput } from "./types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PREFIX = "일실퇴직금 입력 검증 실패";

function assertIsoDate(label: string, value: unknown): void {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    throw new RangeError(`${PREFIX}: ${label} 는 YYYY-MM-DD 형식이어야 합니다.`);
  }
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const reconstructed = new Date(Date.UTC(y, m - 1, d));
  if (
    reconstructed.getUTCFullYear() !== y ||
    reconstructed.getUTCMonth() !== m - 1 ||
    reconstructed.getUTCDate() !== d
  ) {
    throw new RangeError(`${PREFIX}: ${label} 는 유효한 날짜여야 합니다.`);
  }
}

function assertNonNegativeInteger(label: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${PREFIX}: ${label} 는 0 이상 정수여야 합니다.`);
  }
}

/** `lossRatePercent` 는 사망이면 호출자가 100 으로 바꿔 넘긴다. */
export function validateLostRetirementInput(
  input: LostRetirementInput,
  accidentDate: IsoDate,
): void {
  if (input === null || typeof input !== "object") {
    throw new RangeError(`${PREFIX}: 입력 객체가 필요합니다.`);
  }
  if (input.method === "direct") {
    assertNonNegativeInteger("amountWon", input.amountWon);
    return;
  }
  if (
    input.method !== "presentValueMinusReceived" &&
    input.method !== "differenceDiscounted" &&
    input.method !== "bothDiscounted"
  ) {
    throw new RangeError(
      `${PREFIX}: method 는 "direct" | "presentValueMinusReceived" | "differenceDiscounted" | "bothDiscounted" 중 하나여야 합니다.`,
    );
  }
  assertIsoDate("retirementDate", input.retirementDate);
  assertIsoDate("separationDate", input.separationDate);
  if (input.separationDate < accidentDate) {
    throw new RangeError(`${PREFIX}: separationDate 는 사고일 이상이어야 합니다.`);
  }
  if (input.retirementDate < input.separationDate) {
    throw new RangeError(`${PREFIX}: retirementDate 는 separationDate 이상이어야 합니다.`);
  }
  assertNonNegativeInteger("payAtRetirementWon", input.payAtRetirementWon);
  assertNonNegativeInteger("payAtSeparationWon", input.payAtSeparationWon);
  const p = input.lossRatePercent;
  if (
    typeof p !== "number" ||
    !Number.isFinite(p) ||
    p <= 0 ||
    p > 100 ||
    Math.abs(p * 100 - Math.round(p * 100)) > 1e-6
  ) {
    throw new RangeError(
      `${PREFIX}: lossRatePercent 는 0 초과 100 이하, 소수 둘째 자리까지여야 합니다.`,
    );
  }
}
