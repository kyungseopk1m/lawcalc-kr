/**
 * 일실퇴직금.
 *
 * 월수: 정년 n = monthsBetween(사고일, 정년예정일 + 1일) (정년예정일은 마지막 근무일),
 * 퇴직 n = monthsBetween(사고일, 퇴직일). 현가계수 f(n) = 1 / (1 + 0.05 × n/12) = 240 / (240 + n) 을
 * 소수 넷째 자리 아래에서 버린다 (f(24) = 0.9090, f(360) = 0.4). 금액은 모두 정수 연산.
 */

import { addDays, type IsoDate } from "@lawcalc-kr/core-engine";
import { monthsBetween } from "../internal";
import type { LostRetirementInput, LostRetirementResult, LostRetirementWarning } from "./types";
import { validateLostRetirementInput } from "./validators";

/** f(n) × 10000 (소수 넷째 자리 아래 절사, 정수). */
function factor4(months: number): number {
  return Math.floor(2_400_000 / (240 + months));
}

/** floor(won × f4 / 10000). */
function discount(won: number, f4: number): number {
  return Number((BigInt(won) * BigInt(f4)) / 10000n);
}

const won = (v: number) => v.toLocaleString("ko-KR");
const factorText = (f4: number) => (f4 / 10000).toFixed(4);

export function computeLostRetirement(
  input: LostRetirementInput,
  accidentDate: IsoDate,
): LostRetirementResult {
  validateLostRetirementInput(input, accidentDate);
  if (input.method === "direct") {
    return {
      method: "direct",
      baseWon: input.amountWon,
      lossRatePercent: 100,
      amountWon: input.amountWon,
      formulaText: `직접 입력 ${won(input.amountWon)}원`,
      warnings: [],
    };
  }
  const retirementMonths = monthsBetween(accidentDate, addDays(input.retirementDate, 1));
  const fRet = factor4(retirementMonths);
  const pay = input.payAtRetirementWon;
  const received = input.payAtSeparationWon;
  let rawWon: number;
  let text: string;
  let extra: Partial<LostRetirementResult>;
  if (input.method === "differenceDiscounted") {
    const pv = discount(pay - received, fRet);
    // 차액이 음수면 아래에서 0 으로 둔다 (음수 쪽 절사 방향은 결과에 영향 없음).
    rawWon = pv;
    text = `② (${won(pay)} − ${won(received)}) × ${factorText(fRet)} = ${won(pv)}`;
    extra = { retirementPresentValueWon: pv };
  } else {
    const pv = discount(pay, fRet);
    if (input.method === "presentValueMinusReceived") {
      rawWon = pv - received;
      text = `① ${won(pay)} × ${factorText(fRet)} − ${won(received)} = ${won(rawWon)}`;
      extra = { retirementPresentValueWon: pv };
    } else {
      const separationMonths = monthsBetween(accidentDate, input.separationDate);
      const fSep = factor4(separationMonths);
      const sepPv = discount(received, fSep);
      rawWon = pv - sepPv;
      text = `③ ${won(pay)} × ${factorText(fRet)} − ${won(received)} × ${factorText(fSep)} = ${won(rawWon)}`;
      extra = {
        separationMonths,
        separationFactor: fSep / 10000,
        retirementPresentValueWon: pv,
        separationPresentValueWon: sepPv,
      };
    }
  }
  const warnings: LostRetirementWarning[] = [];
  const baseWon = Math.max(0, rawWon);
  if (rawWon < 0) {
    warnings.push({
      code: "negativeClamped",
      message: `현가 차이가 ${won(rawWon)}원으로 음수라 일실퇴직금을 0원으로 둡니다.`,
    });
  }
  const rate100 = Math.round(input.lossRatePercent * 100);
  const amountWon = Number((BigInt(baseWon) * BigInt(rate100)) / 10000n);
  return {
    method: input.method,
    retirementMonths,
    retirementFactor: fRet / 10000,
    ...extra,
    baseWon,
    lossRatePercent: rate100 / 100,
    amountWon,
    formulaText: rate100 === 10000 ? text : `${text}, × ${rate100 / 100}% = ${won(amountWon)}`,
    warnings,
  };
}
