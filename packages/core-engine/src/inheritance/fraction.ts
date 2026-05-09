/**
 * BigInt 기반 분수. JS `number` 부동소수점 누적 오차 회피
 * (예: 1.5 / (1.5 + 2) = 0.4285714285714286... 무한소수).
 *
 * 약분: Euclidean GCD. 분수 출력 정원은 source-extraction-spike-2026-05-09.md §8.2 #3
 * (UI strings `1/1`, `[배우자] (1X1)` verbatim) 참조.
 */

export interface BigFraction {
  num: bigint;
  den: bigint;
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export function simplify(f: BigFraction): BigFraction {
  if (f.den === 0n) throw new RangeError("분모가 0인 분수는 정의되지 않습니다");
  if (f.num === 0n) return { num: 0n, den: 1n };
  const g = gcd(f.num, f.den);
  return { num: f.num / g, den: f.den / g };
}

/**
 * BigInt 분수를 number 쌍으로 안전 변환. 안전 정수 범위(2^53-1) 초과 시 RangeError.
 */
export function toNumberPair(f: BigFraction): { numerator: number; denominator: number } {
  const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
  if (f.num > SAFE || f.num < -SAFE || f.den > SAFE) {
    throw new RangeError("분수가 안전한 정수 범위(2^53-1)를 초과합니다");
  }
  return { numerator: Number(f.num), denominator: Number(f.den) };
}
