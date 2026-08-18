/**
 * 상속분 간이 계산 — 6 step 알고리즘.
 *
 * 1. 입력 검증 (1991-01-01 cutoff, 2차 대습 거부, 직계존속·방계 대습 거부, 촌수 양의정수)
 * 2. fall-through 그룹 결정 (1·2·배우자단·3·4 순서). 2·4 순위는 최근친(최소 촌수)만 (§1000②).
 *    상속포기(`renounced`)한 자는 이 단계에서 빠진다 — 대습 사유가 아니라서 슬롯도 남기지
 *    않는다 (§1001). 한 촌수 전원이 포기하면 배우자가 있을 때는 배우자 단독(§1043), 없을
 *    때는 다음 촌수가 본위상속한다.
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

/** 실제로 지분을 받을 수 있는 대습자 — 생존해 있고 스스로 포기하지도 않은 자. */
function livingReps(h: HeirNode): HeirNode[] {
  return (h.representatives ?? []).filter((r) => !r.deceasedBeforeOpening && !r.renounced);
}

/**
 * 슬롯 유지 조건의 대습 판정 — 대습자가 1명이라도 생존해야 해당 슬롯이 상속한다.
 * 대습자 전원이 상속개시 전 사망/결격이거나 상속을 포기하면 그 슬롯은 소멸한다
 * (죽은 자·포기자에게 지분 귀속 방지).
 */
function hasLivingRepresentative(h: HeirNode): boolean {
  return livingReps(h).length > 0;
}

/** 슬롯을 차지하는 상속인 — 생존해 있거나, 사망했지만 대습자가 남아 있는 자. */
function slotted(heirs: HeirNode[]): HeirNode[] {
  return heirs.filter((h) => !h.deceasedBeforeOpening || hasLivingRepresentative(h));
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

/**
 * 한 순위 그룹의 상속 결과.
 *
 * - `inherit`: 이 그룹이 (배우자와 함께) 상속한다.
 * - `spouseSole`: 그룹은 존재했으나 상속인이 될 사람이 전원 포기했고 배우자가 있다 →
 *   배우자 단독상속. 다음 촌수·다음 순위로 내려가지 않는다.
 * - `none`: 이 그룹에는 상속인이 없다 → 다음 순위로.
 */
type GroupOutcome =
  { kind: "inherit"; heirs: HeirNode[] } | { kind: "spouseSole" } | { kind: "none" };

/**
 * 한 순위 그룹에서 실제로 상속하는 집합을 고른다.
 *
 * 최근친(§1000②)을 먼저 정하고 **그 안에서** 포기자를 뺀다. 순서가 중요하다.
 * 그 촌수 전원이 포기했다면:
 *
 *   - 배우자가 있으면 §1043("상속인이 수인인 경우에 어느 상속인이 상속을 포기한 때에는 그
 *     상속분은 다른 상속인의 상속분의 비율로 그 상속인에게 귀속된다")의 "다른 상속인" 이
 *     배우자뿐이므로 배우자가 단독상속한다. 다음 촌수로 내려가지 않는다
 *     (대법원 2023. 3. 23.자 2020그42 전합 — 종전 2013다48852 변경).
 *   - 배우자가 없으면 "다른 상속인" 이 없으므로 다음 촌수가 **본위상속** 한다
 *     (대법원 1995. 9. 26. 선고 95다27769). 대습이 아니라 본위상속이므로 대습 슬롯을
 *     만들지 않는다.
 *
 * 포기가 하나도 없으면 `closestByDegree(slotted(group))` 를 그대로 돌려주므로 기존
 * 입력·골든·`.lcalc` 결과는 완전히 무변경이다.
 */
function resolveGroup(group: HeirNode[], spouseAlive: boolean): GroupOutcome {
  let pool = slotted(group);
  while (pool.length > 0) {
    const closest = closestByDegree(pool);
    const remaining = closest.filter((h) => !h.renounced);
    if (remaining.length > 0) {
      return { kind: "inherit", heirs: remaining };
    }
    if (spouseAlive) {
      return { kind: "spouseSole" };
    }
    pool = pool.filter((h) => !closest.includes(h));
  }
  return { kind: "none" };
}

/**
 * 민법 제1003조 2항 개정 시행일 (법률 제21454호, 공포한 날부터 시행).
 *
 * 개정 전: "사망 또는 결격된 자의 배우자" / 개정 후: "상속개시전에 사망한 사람의 배우자".
 * 부칙 제2조의 적용례는 제1008조 단서·제1004조의2·제1001조 중 제1004조의2 관련 부분만
 * 소급시키고 **제1003조는 넣지 않았다.** 따라서 일반 원칙대로 시행일 이후 개시된 상속부터
 * 적용한다.
 */
const SPOUSE_REPRESENTATION_NARROWED_FROM = "2026-03-17";

/**
 * 개정 제1003조 2항 적용 — 결격·상속권 상실이 원인이면 피대습자의 배우자를 대습에서 뺀다.
 *
 * 제1001조의 직계비속 대습은 그대로 유지되므로 손자녀 등은 남는다. 배우자 대습자만 사라진다.
 *
 * 대습자 목록을 계산 **이전에** 한 번 정리한다. `livingReps` / `hasLivingRepresentative` /
 * `slotted` / 두 분배 함수가 모두 같은 목록을 보게 되므로, 호출부마다 조건을 다시 거는
 * 방식에서 생기는 누락이 없다 (배우자가 유일한 대습자였다면 슬롯 자체가 사라지는 것까지
 * 자동으로 맞는다).
 */
function narrowSpouseRepresentation(heirs: HeirNode[] | undefined): HeirNode[] | undefined {
  if (!heirs) return heirs;
  return heirs.map((h) => {
    if (!h.representatives || (h.representationCause ?? "death") === "death") return h;
    const kept = h.representatives.filter((r) => !r.isSpouseOfRepresented);
    return kept.length === h.representatives.length ? h : { ...h, representatives: kept };
  });
}

function defaultName(prefix: string, idx: number, h: HeirNode): string {
  return h.name ?? `${prefix}${idx + 1}`;
}

/**
 * 촌수(degree)는 HeirNode 공통 필드라 모든 순위·대습 노드에서 검증한다 (§1000② 최근친 우선
 * 판정에 쓰이며, 지정 시 1 이상의 정수). 직계비속·직계존속·방계 4순위는 계산에 실제로
 * 반영하고, 형제자매·대습 노드에서는 쓰이지 않더라도 잘못된 값을 public API 경계에서
 * 거부한다 (`.lcalc` 검증과 동일 정책).
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
  // 사망·결격과 포기는 양립할 수 없다. 상속개시 전에 사망한 사람은 포기할 수 없고, 결격자는
  // 포기할 지분 자체가 없다. 이 조합을 허용하면 포기자 제외가 먼저 걸려 대습 슬롯이 통째로
  // 사라지고, 화면에 남아 있는 대습상속인이 결과에서만 조용히 빠진다.
  for (const group of [
    input.linealDescendants,
    input.linealAscendants,
    input.siblings,
    input.collateralFourth,
  ]) {
    if (!group) continue;
    for (const h of group) {
      if (h.deceasedBeforeOpening && h.renounced) {
        throw new RangeError(
          "상속개시 전 사망·결격과 상속포기는 동시에 지정할 수 없습니다 (포기는 대습 원인이 아닙니다).",
        );
      }
    }
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
  const slotCount = BigInt(slotted(group).length);
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
      shares.push(...splitSlotAmongReps(slotShare, livingReps(h), heirName));
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
  const denominator = BigInt(slotted(group).length);
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
      shares.push(...splitSlotAmongReps(slotShare, livingReps(h), heirName));
    }
    nameIdx++;
  }
  return shares;
}

export function calculateInheritance(input: InheritanceInput): InheritanceResult {
  validateInput(input);

  const spouseAlive = !!input.spouse?.alive;
  const spouseName = input.spouse?.name ?? "배우자";

  // 개정 제1003조 2항은 시행일 이후 개시된 상속에만 적용한다. 대습이 가능한 1·3순위만 대상.
  const narrowSpouseReps = input.decedent.deceasedAt >= SPOUSE_REPRESENTATION_NARROWED_FROM;
  const desc =
    (narrowSpouseReps
      ? narrowSpouseRepresentation(input.linealDescendants)
      : input.linealDescendants) ?? [];
  const asc = input.linealAscendants ?? [];
  const sib =
    (narrowSpouseReps ? narrowSpouseRepresentation(input.siblings) : input.siblings) ?? [];
  const col = input.collateralFourth ?? [];

  const spouseSole: RawShare[] = [{ name: spouseName, raw: { num: 1n, den: 1n } }];

  // 직계비속도 최근친 우선(§1000②) 대상이다. 자(1촌)와 손(2촌)을 함께 넣으면 자만
  // 상속하고, 손자녀는 사망한 자의 대습(representatives)으로만 들어온다.
  // 촌수를 한 명이라도 지정하지 않으면 `closestByDegree` 가 원본을 그대로 돌려주므로
  // 기존 입력·골든·`.lcalc` 결과는 무변경이다 (존속·방계와 동일 정책).
  const descOutcome = resolveGroup(desc, spouseAlive);
  // 직계존속은 대습 X (validator 가 거부) — 최근친(부모 우선 조부모, §1000②)만 분배
  const ascOutcome = resolveGroup(asc, spouseAlive);
  // 3·4순위는 배우자가 있으면 애초에 상속하지 않으므로 spouseAlive=false 로 푼다.
  // 형제자매는 종전대로 촌수 필터를 타지 않는다 (전원 2촌이라 최근친 판정이 무의미하고,
  // `degree` 를 지정한 기존 입력의 결과를 바꾸지 않기 위해서다). 포기자만 뺀다.
  const sibHeirs = slotted(sib).filter((h) => !h.renounced);
  const colOutcome = resolveGroup(col, false);

  let rawShares: RawShare[];

  if (descOutcome.kind === "inherit") {
    rawShares = distributeWithSpouse(
      descOutcome.heirs,
      spouseAlive ? spouseName : null,
      "자녀",
      LINEAL_UNIT,
    );
  } else if (descOutcome.kind === "spouseSole") {
    rawShares = spouseSole;
  } else if (ascOutcome.kind === "inherit") {
    rawShares = distributeWithSpouse(
      ascOutcome.heirs,
      spouseAlive ? spouseName : null,
      "직계존속",
      ASCENDANT_UNIT,
    );
  } else if (ascOutcome.kind === "spouseSole") {
    rawShares = spouseSole;
  } else if (spouseAlive) {
    rawShares = spouseSole;
  } else if (sibHeirs.length > 0) {
    rawShares = distributeEqual(sibHeirs, "형제자매");
  } else if (colOutcome.kind === "inherit") {
    rawShares = distributeEqual(colOutcome.heirs, "방계혈족");
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
