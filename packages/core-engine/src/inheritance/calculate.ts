/**
 * 상속분 간이 계산 — 6 step 알고리즘.
 *
 * 1. 입력 검증 (1991-01-01 cutoff, 2차 대습 거부, 직계존속·방계 대습 거부, 촌수 양의정수)
 * 2. fall-through 그룹 결정 (1·2·배우자단·3·4 순서). 2·4 순위는 최근친(최소 촌수)만 (§1000②)
 * 3. 1차 분배 — 1·2 순위 + 배우자 동순위, 또는 3·4 순위 단독
 * 4. 대습 split — 1·3 순위만. 피대습자의 배우자(며느리·사위)는 §1009② 준용 5할 가산
 * 5. GCD 약분
 * 6. InheritanceResult 출력
 *
 * 비율 (BigInt unit, 1.5 → 3 / 1 → 2 로 표현해 정수 산술 유지):
 * - 배우자 unit = 3 (1.5 × 2)
 * - 직계비속/직계존속 unit = 2 (1 × 2)
 * - 형제자매·방계 unit = 1 (균분만)
 *
 * 한국어 toast 메시지 출처: source-extraction-spike-2026-05-09.md §8.3 (UI strings verbatim).
 */

import { STANDARD_DISCLAIMER } from "../disclaimers";
import { type BigFraction, simplify, toNumberPair } from "./fraction";
import type { HeirNode, InheritanceInput, InheritanceResult, InheritanceShare } from "./types";

const INHERITANCE_DATA_VERSION = "inheritance/v1.0.0";
const CUTOFF_DATE = "1991-01-01";

const SPOUSE_UNIT = 3n;
const LINEAL_UNIT = 2n;
const ASCENDANT_UNIT = 2n;

interface RawShare {
  name: string;
  raw: BigFraction;
}

function isValidIsoDate(s: string | undefined): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * 슬롯 유지 조건의 대습 판정 — 대습자가 1명이라도 생존해야 해당 슬롯이 상속한다.
 * 대습자 전원이 상속개시 전 사망/결격이면 그 슬롯은 소멸한다 (죽은 자에게 지분 귀속 방지).
 */
function hasLivingRepresentative(h: HeirNode): boolean {
  return h.representatives !== undefined && h.representatives.some((r) => !r.deceasedBeforeOpening);
}

/**
 * 같은 순위 안에서 촌수가 다르면 최근친(최소 촌수)만 남긴다 (민법 §1000② — 부모 우선 조부모,
 * 삼촌 우선 사촌). 한 명이라도 `degree` 미지정이면 정보가 불완전하므로 필터하지 않고
 * 전원 동순위로 균분한다 (하위호환 — 기존 입력·골든·`.lcalc` 무영향).
 */
function closestByDegree(heirs: HeirNode[]): HeirNode[] {
  if (heirs.length === 0 || heirs.some((h) => h.degree === undefined)) return heirs;
  const minDegree = Math.min(...heirs.map((h) => h.degree as number));
  return heirs.filter((h) => h.degree === minDegree);
}

/**
 * 대습 slot 을 생존 대습상속인에게 분할한다.
 *
 * 피대습자의 배우자(`isSpouseOfRepresented`)가 있으면 §1009② 를 준용해 5할 가산한다
 * (배우자 unit 3 : 직계비속 unit 2). 배우자 표시가 없으면 전원 균분으로, 종전과
 * 완전히 동일한 raw 분수를 만든다 (배우자 없는 기존 골든 byte-identical).
 */
function splitSlotAmongReps(
  slotShare: BigFraction,
  livingReps: HeirNode[],
  heirName: string,
): RawShare[] {
  const out: RawShare[] = [];
  const hasSpouseRep = livingReps.some((r) => r.isSpouseOfRepresented);
  const totalUnits = hasSpouseRep
    ? livingReps.reduce((acc, r) => acc + (r.isSpouseOfRepresented ? SPOUSE_UNIT : LINEAL_UNIT), 0n)
    : BigInt(livingReps.length);
  let repIdx = 0;
  for (const rep of livingReps) {
    const repName = rep.name ?? `${heirName}의 대습${repIdx + 1}`;
    const raw: BigFraction = hasSpouseRep
      ? {
          num: slotShare.num * (rep.isSpouseOfRepresented ? SPOUSE_UNIT : LINEAL_UNIT),
          den: slotShare.den * totalUnits,
        }
      : { num: slotShare.num, den: slotShare.den * totalUnits };
    out.push({ name: repName, raw });
    repIdx++;
  }
  return out;
}

function inheritsBy(heirs: HeirNode[]): boolean {
  return heirs.some((h) => !h.deceasedBeforeOpening || hasLivingRepresentative(h));
}

function aliveCount(heirs: HeirNode[]): number {
  return heirs.filter((h) => !h.deceasedBeforeOpening).length;
}

function defaultName(prefix: string, idx: number, h: HeirNode): string {
  return h.name ?? `${prefix}${idx + 1}`;
}

/**
 * 촌수(degree)는 HeirNode 공통 필드라 모든 순위·대습 노드에서 검증한다 (§1000② 최근친 우선
 * 판정에 쓰이며, 지정 시 1 이상의 정수). 직계비속/형제자매/대습 노드에서는 계산에 쓰이지
 * 않더라도 잘못된 값은 public API 경계에서 거부한다 (`.lcalc` 검증과 동일 정책).
 */
function validateHeirDegrees(heirs: HeirNode[] | undefined): void {
  if (!heirs) return;
  for (const h of heirs) {
    if (h.degree !== undefined && (!Number.isInteger(h.degree) || h.degree <= 0)) {
      throw new RangeError("촌수(degree)는 1 이상의 정수여야 합니다.");
    }
    validateHeirDegrees(h.representatives);
  }
}

function validateInput(input: InheritanceInput): void {
  if (!input.decedent || !isValidIsoDate(input.decedent.deceasedAt)) {
    throw new RangeError("피상속인 사망일이 누락되었거나 형식이 올바르지 않습니다");
  }
  if (input.decedent.deceasedAt < CUTOFF_DATE) {
    throw new RangeError(
      `1991-01-01 이전 사망 케이스는 본 버전에서 지원하지 않습니다 (입력: ${input.decedent.deceasedAt})`,
    );
  }
  // 2차 대습 거부 (1·3순위만 검사 — 2·4순위는 1차 대습부터 거부 대상)
  for (const group of [input.linealDescendants, input.siblings]) {
    if (!group) continue;
    for (const h of group) {
      if (!h.representatives) continue;
      for (const r of h.representatives) {
        if (r.representatives && r.representatives.length > 0) {
          throw new RangeError("2차 이상 대습은 본 버전에서 지원하지 않습니다.");
        }
      }
    }
  }
  // 2·4순위 대습 거부 (1001조)
  for (const heirs of [input.linealAscendants, input.collateralFourth]) {
    if (!heirs) continue;
    for (const h of heirs) {
      if (h.representatives && h.representatives.length > 0) {
        throw new RangeError("직계존속과 4촌 이내 방계혈족은 대습상속 대상이 아닙니다.");
      }
    }
  }
  // 촌수(degree)는 HeirNode 공통 필드 — 모든 순위·대습 노드에서 지정 시 1 이상의 정수여야 한다.
  for (const group of [
    input.linealDescendants,
    input.linealAscendants,
    input.siblings,
    input.collateralFourth,
  ]) {
    validateHeirDegrees(group);
  }
}

/**
 * 1·2순위 그룹 + 배우자 동순위 분배.
 *
 * 분모 = `SPOUSE_UNIT` (배우자 있을 때만 3 가산) + `groupUnit` × (살아있는 자 + 대습 보유 자).
 *
 * 예시 (배우자 + 자녀 2): denom = 3 + 2*2 = 7. 배우자 3/7, 자녀 2/7 × 2.
 */
function distributeWithSpouse(
  group: HeirNode[],
  spouseName: string | null,
  defaultPrefix: string,
  groupUnit: bigint,
): RawShare[] {
  const slotted = group.filter((h) => !h.deceasedBeforeOpening || hasLivingRepresentative(h));
  const slotCount = BigInt(slotted.length);
  const denominator = (spouseName !== null ? SPOUSE_UNIT : 0n) + groupUnit * slotCount;

  const shares: RawShare[] = [];
  if (spouseName !== null) {
    shares.push({ name: spouseName, raw: { num: SPOUSE_UNIT, den: denominator } });
  }

  let nameIdx = 0;
  for (const h of group) {
    const isAlive = !h.deceasedBeforeOpening;
    const hasReps = hasLivingRepresentative(h);
    if (!isAlive && !hasReps) continue; // 사망 + 생존 대습자 0 → 슬롯 사라짐

    const heirName = defaultName(defaultPrefix, nameIdx, h);
    const slotShare: BigFraction = { num: groupUnit, den: denominator };

    if (isAlive) {
      shares.push({ name: heirName, raw: slotShare });
    } else if (h.representatives) {
      const livingReps = h.representatives.filter((r) => !r.deceasedBeforeOpening);
      shares.push(...splitSlotAmongReps(slotShare, livingReps, heirName));
    }
    nameIdx++;
  }
  return shares;
}

/**
 * 3·4순위 단독 그룹 균분. 3순위(형제자매)는 대습 가능, 4순위는 대습 X (호출 전 검증).
 * 분모 = 살아있는 자 + 대습 보유 자.
 */
function distributeEqual(group: HeirNode[], defaultPrefix: string): RawShare[] {
  const slotted = group.filter((h) => !h.deceasedBeforeOpening || hasLivingRepresentative(h));
  const denominator = BigInt(slotted.length);
  if (denominator === 0n) return [];

  const shares: RawShare[] = [];
  let nameIdx = 0;
  for (const h of group) {
    const isAlive = !h.deceasedBeforeOpening;
    const hasReps = hasLivingRepresentative(h);
    if (!isAlive && !hasReps) continue;

    const heirName = defaultName(defaultPrefix, nameIdx, h);
    const slotShare: BigFraction = { num: 1n, den: denominator };

    if (isAlive) {
      shares.push({ name: heirName, raw: slotShare });
    } else if (h.representatives) {
      const livingReps = h.representatives.filter((r) => !r.deceasedBeforeOpening);
      shares.push(...splitSlotAmongReps(slotShare, livingReps, heirName));
    }
    nameIdx++;
  }
  return shares;
}

export function calculateInheritance(input: InheritanceInput): InheritanceResult {
  validateInput(input);

  const spouseAlive = !!input.spouse?.alive;
  const spouseName = input.spouse?.name ?? "배우자";

  const desc = input.linealDescendants ?? [];
  const asc = input.linealAscendants ?? [];
  const sib = input.siblings ?? [];
  const col = input.collateralFourth ?? [];

  let rawShares: RawShare[];

  if (inheritsBy(desc)) {
    rawShares = distributeWithSpouse(desc, spouseAlive ? spouseName : null, "자녀", LINEAL_UNIT);
  } else if (aliveCount(asc) > 0) {
    // 직계존속은 대습 X — 살아있는 자만, 그중 최근친(부모 우선 조부모, §1000②)만 분배
    const closestAsc = closestByDegree(asc.filter((h) => !h.deceasedBeforeOpening));
    rawShares = distributeWithSpouse(
      closestAsc,
      spouseAlive ? spouseName : null,
      "직계존속",
      ASCENDANT_UNIT,
    );
  } else if (spouseAlive) {
    rawShares = [{ name: spouseName, raw: { num: 1n, den: 1n } }];
  } else if (inheritsBy(sib)) {
    rawShares = distributeEqual(sib, "형제자매");
  } else if (aliveCount(col) > 0) {
    // 방계 4순위도 최근친(삼촌 우선 사촌, §1000②)만 분배
    rawShares = distributeEqual(
      closestByDegree(col.filter((h) => !h.deceasedBeforeOpening)),
      "방계혈족",
    );
  } else {
    throw new RangeError("상속인이 없습니다");
  }

  const shares: InheritanceShare[] = rawShares.map((rs) => {
    const simplified = simplify(rs.raw);
    const simplePair = toNumberPair(simplified);
    const rawPair = toNumberPair(rs.raw);
    return {
      name: rs.name,
      numerator: simplePair.numerator,
      denominator: simplePair.denominator,
      rawNumerator: rawPair.numerator,
      rawDenominator: rawPair.denominator,
    };
  });

  return {
    decedent: {
      ...(input.decedent.name === undefined ? {} : { name: input.decedent.name }),
      deceasedAt: input.decedent.deceasedAt,
    },
    shares,
    disclaimer: STANDARD_DISCLAIMER,
    dataVersion: INHERITANCE_DATA_VERSION,
    computedAt: new Date().toISOString(),
  };
}
