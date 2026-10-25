/**
 * 구법 상속분 (피상속인 사망 1960-01-01 ~ 1990-12-31).
 *
 * 근거는 사망일 당시 시행 민법 원문이다 (법제처 연혁 법령, 규칙표와 원문 인용은
 * 사망일별 구 민법 조문 대조로 정리했다).
 *
 * - 1960-01-01 ~ 1978-12-31: 제정 민법(법률 제471호) 제1000조~제1010조. 1962·1964·1970 개정은
 *   상속편 조문을 바꾸지 않았다 (연혁 본문 대조).
 * - 1979-01-01 ~ 1990-12-31: 1977. 12. 31. 개정(법률 제3051호, 1979. 1. 1. 시행) 제1009조.
 *   1984 개정도 상속분 조문을 바꾸지 않았다.
 * - 각 개정 부칙(제471호 부칙 제25조 제1항, 제3051호 부칙 제5항, 제4199호 부칙 제12조 제1항)이
 *   시행일 전에 개시된 상속에 종전 규정을 적용하므로 사망일로 시기를 가른다.
 * - 1960-01-01 전 사망은 민법 시행 전 관습법 영역이라 계산하지 않는다.
 *
 * 정수 산술을 위해 "남자의 상속분" 을 8 단위로 둔다 (1/4 → 2, 1/2 → 4, 5할 가산 → ×3/2).
 */

import type { BigFraction } from "./fraction";
import type { HeirNode, InheritanceInput } from "./types";

export const OLD_LAW_FROM = "1960-01-01";
export const OLD_LAW_1977_AMENDMENT_FROM = "1979-01-01";
export const OLD_LAW_DATA_VERSION = "inheritance-pre1991/v1.0.0";

const MALE = 8n;

interface RawShare {
  name: string;
  raw: BigFraction;
}

type Period = "1960" | "1979";

/** 구법 필드가 하나라도 있으면 구법 입력으로 본다. 없으면 종전 입력(1991 이후 모델)이다. */
export function hasOldLawFields(input: InheritanceInput): boolean {
  const walk = (nodes: HeirNode[] | undefined): boolean =>
    (nodes ?? []).some(
      (n) =>
        n.sex !== undefined ||
        n.sameFamilyRegister !== undefined ||
        n.hojuSuccessor !== undefined ||
        walk(n.representatives),
    );
  return (
    input.spouse?.relation !== undefined ||
    [input.linealDescendants, input.linealAscendants, input.siblings, input.collateralFourth].some(
      walk,
    )
  );
}

function fail(message: string): never {
  throw new RangeError(`${message} 구법 사건은 전문가 확인이 필요합니다.`);
}

/**
 * 구 민법 제1009조 제1항·제2항에 따른 상속인 본인의 가중치 (남자 = 8).
 * 호주상속 5할 가산은 "그 고유의 상속분" 에 붙는다.
 */
function heirWeight(h: HeirNode, period: Period): bigint {
  let w: bigint;
  if (h.sex === "male") w = MALE;
  else if (h.sameFamilyRegister === false)
    w = MALE / 4n; // 제1009조 제2항
  else w = period === "1960" ? MALE / 2n : MALE; // 1960~78 제1009조 제1항 단서 후단
  return h.hojuSuccessor ? (w * 3n) / 2n : w;
}

/** 처의 가중치 (구 민법 제1009조 제3항). 직계비속과 공동이면 `withDescendants`. */
function wifeWeight(period: Period, withDescendants: boolean): bigint {
  if (period === "1960") return withDescendants ? MALE / 2n : MALE; // 남자의 1/2, 남자와 균분
  // 1977 개정: 동일가적내 직계비속 / 직계존속의 상속분의 5할 가산
  return (MALE * 3n) / 2n;
}

function nameOf(h: HeirNode, fallback: string): string {
  return h.name ?? fallback;
}

function livingReps(h: HeirNode): HeirNode[] {
  return (h.representatives ?? []).filter((r) => !r.deceasedBeforeOpening);
}

function slotted(heirs: HeirNode[]): HeirNode[] {
  return heirs.filter((h) => !h.deceasedBeforeOpening || livingReps(h).length > 0);
}

function closestByDegree(heirs: HeirNode[]): HeirNode[] {
  if (heirs.length === 0 || heirs.some((h) => h.degree === undefined)) return heirs;
  const min = Math.min(...heirs.map((h) => h.degree as number));
  return heirs.filter((h) => h.degree === min);
}

function validate(input: InheritanceInput): void {
  if (input.spouse?.alive && input.spouse.relation === undefined) {
    fail("구법(1991-01-01 전 사망) 계산에는 배우자가 처인지 남편인지 지정해야 합니다.");
  }
  const groups: Array<[HeirNode[] | undefined, string]> = [
    [input.linealDescendants, "직계비속"],
    [input.linealAscendants, "직계존속"],
    [input.siblings, "형제자매"],
    [input.collateralFourth, "방계혈족"],
  ];
  let hoju = 0;
  const checkPerson = (h: HeirNode, label: string) => {
    if (h.deceasedBeforeOpening && h.representationCause === "forfeited") {
      fail(
        `${label}: 상속권 상실선고(민법 제1004조의2)는 1991년 이후 민법 개정으로 신설된 제도라 1991-01-01 전 사망 사건의 대습 원인이 될 수 없습니다 (구 민법 제1001조는 상속개시 전 사망·결격만 정합니다).`,
      );
    }
    if (h.renounced) fail(`${label}: 구법 사건의 상속포기는 이 버전에서 계산하지 않습니다.`);
    if (h.sex === undefined) fail(`${label}: 구법 계산에는 상속인의 성별이 필요합니다.`);
    if (h.sex === "female" && h.sameFamilyRegister === undefined) {
      fail(`${label}: 구법 계산에는 여자 상속인의 동일가적 여부(출가 여부)가 필요합니다.`);
    }
  };
  for (const [group, groupLabel] of groups) {
    for (const h of group ?? []) {
      const label = nameOf(h, groupLabel);
      checkPerson(h, label);
      if (h.hojuSuccessor) {
        hoju++;
        if (groupLabel !== "직계비속" || h.deceasedBeforeOpening) {
          fail(
            `${label}: 호주상속 가산은 생존한 1순위 직계비속 본인에게만 계산합니다 (대습 호주상속·처·직계존속 호주상속 미지원).`,
          );
        }
        if (h.sex === "female" && h.sameFamilyRegister !== true) {
          fail(`${label}: 여자 호주상속인은 피상속인의 가족이어야 합니다 (구 민법 제984조 제2호).`);
        }
      }
      for (const r of h.representatives ?? []) {
        const repLabel = nameOf(r, `${label}의 대습상속인`);
        if (r.hojuSuccessor) {
          fail(`${repLabel}: 대습상속인의 호주상속 가산은 이 버전에서 계산하지 않습니다.`);
        }
        if (r.isSpouseOfRepresented) {
          if (r.renounced)
            fail(`${repLabel}: 구법 사건의 상속포기는 이 버전에서 계산하지 않습니다.`);
          if (h.sex !== "male") {
            fail(
              `${repLabel}: 구 민법 제1003조 제2항은 사망 또는 결격된 자의 "처" 만 대습상속인으로 정합니다 (사위 대습 없음).`,
            );
          }
          continue;
        }
        checkPerson(r, repLabel);
      }
    }
  }
  if (hoju > 1) fail("호주상속인은 한 명만 지정할 수 있습니다.");
  const desc = input.linealDescendants ?? [];
  const daughterHoju = desc.find((h) => h.hojuSuccessor && h.sex === "female");
  if (daughterHoju) {
    // 직계비속남자: 생존한 아들(손자 포함), 또는 사망·결격한 자녀를 대습하는 생존 남자.
    const hasMale = desc.some((h) =>
      h.deceasedBeforeOpening
        ? livingReps(h).some((r) => !r.isSpouseOfRepresented && r.sex === "male")
        : h.sex === "male",
    );
    if (hasMale) {
      fail(
        `${nameOf(daughterHoju, "직계비속")}: 직계비속남자가 있으면 여자는 호주상속인이 될 수 없습니다 (구 민법 제984조 제1호 "피상속인의 직계비속남자" 가 제2호 "피상속인의 가족인 직계비속여자" 보다 앞선 순위).`,
      );
    }
  }
  for (const h of input.collateralFourth ?? []) {
    if (h.degree !== undefined && h.degree > 8) {
      fail("구 민법 제1000조 제1항 제4호의 방계혈족은 8촌 이내입니다.");
    }
  }
}

/**
 * 한 슬롯(가중치 `slotWeight`)을 대습상속인에게 나눈다 (구 민법 제1010조 제2항: 피대습자의 상속분
 * 한도에서 제1009조로 정한다. 제1003조 제2항의 처도 같다).
 */
function splitReps(
  reps: HeirNode[],
  period: Period,
  heirName: string,
): Array<{ name: string; weight: bigint }> {
  const hasDesc = reps.some((r) => !r.isSpouseOfRepresented);
  return reps.map((r, i) => ({
    name: r.name ?? `${heirName}의 대습${i + 1}`,
    weight: r.isSpouseOfRepresented ? wifeWeight(period, hasDesc) : heirWeight(r, period),
  }));
}

function distribute(
  heirs: HeirNode[],
  period: Period,
  prefix: string,
  spouse: { name: string; weight: bigint } | null,
): RawShare[] {
  const slots = heirs.map((h, i) => ({ h, name: nameOf(h, `${prefix}${i + 1}`) }));
  const total =
    (spouse?.weight ?? 0n) + slots.reduce((acc, { h }) => acc + heirWeight(h, period), 0n);
  const out: RawShare[] = [];
  if (spouse) out.push({ name: spouse.name, raw: { num: spouse.weight, den: total } });
  for (const { h, name } of slots) {
    const w = heirWeight(h, period);
    if (!h.deceasedBeforeOpening) {
      out.push({ name, raw: { num: w, den: total } });
      continue;
    }
    const parts = splitReps(livingReps(h), period, name);
    const repTotal = parts.reduce((acc, p) => acc + p.weight, 0n);
    for (const p of parts)
      out.push({ name: p.name, raw: { num: w * p.weight, den: total * repTotal } });
  }
  return out;
}

/**
 * 구법 원분수. `trace` 가 주어지면 판단 경로를 덧붙인다.
 * 호출 전제: 사망일이 1960-01-01 ~ 1990-12-31 이고 `hasOldLawFields(input)` 가 참.
 */
export function oldLawRawShares(
  input: InheritanceInput,
  trace: string[] | null,
  warnings: string[],
): RawShare[] {
  validate(input);
  const period: Period = input.decedent.deceasedAt < OLD_LAW_1977_AMENDMENT_FROM ? "1960" : "1979";
  const lawLabel =
    period === "1960"
      ? "구 민법(1958. 2. 22. 법률 제471호, 1960. 1. 1. 시행)"
      : "구 민법(1977. 12. 31. 법률 제3051호로 개정, 1979. 1. 1. 시행)";
  const t = (line: string) => trace?.push(line);
  t(
    `구법 적용: 사망일 ${input.decedent.deceasedAt} 당시 ${lawLabel} (각 개정 부칙의 상속 경과규정)`,
  );
  t("주의: 구법 사건은 가족관계·호적 사실관계에 따라 결과가 달라지므로 전문가 확인이 필요합니다.");

  const spouseAlive = !!input.spouse?.alive;
  const isWife = spouseAlive && input.spouse!.relation === "wife";
  const isHusband = spouseAlive && input.spouse!.relation === "husband";
  const spouseName = input.spouse?.name ?? (isWife ? "처" : "남편");

  const desc = closestByDegree(slotted(input.linealDescendants ?? []));
  const asc = closestByDegree(slotted(input.linealAscendants ?? []));
  const sib = slotted(input.siblings ?? []);
  const col = closestByDegree(slotted(input.collateralFourth ?? []));

  const weightNote =
    period === "1960"
      ? "남자 1, 동일가적내 여자 1/2, 동일가적내에 없는 여자 1/4, 호주상속인 고유 상속분 5할 가산 (구 민법 제1009조 제1항·제2항)"
      : "남자·동일가적내 여자 1, 동일가적내에 없는 여자 1/4, 호주상속인 고유 상속분 5할 가산 (구 민법 제1009조 제1항·제2항)";
  const traceReps = (heirs: HeirNode[]) => {
    for (const h of heirs.filter((x) => x.deceasedBeforeOpening)) {
      t(
        `대습: ${h.name ?? "피대습자"}의 상속분을 ${livingReps(h)
          .map((r) => r.name ?? "대습자")
          .join(", ")} 이(가) 제1009조 비율로 나눔 (구 민법 제1001조, 제1003조 제2항, 제1010조)`,
      );
    }
  };

  const hojuHeir = desc.find((h) => h.hojuSuccessor);
  if (isHusband && hojuHeir) {
    warnings.push(
      `${nameOf(hojuHeir, "호주상속인")}: 피상속인이 처이고 남편이 생존해 있습니다. 호주상속은 호주가 사망한 때 개시되므로(구 민법 제980조), 처가 호주가 아니면 호주상속 5할 가산(구 민법 제1009조 제1항 단서)이 없습니다. 입부혼 등으로 처가 호주였던 경우에만 가산이 맞습니다. 호적을 확인하세요.`,
    );
  }
  // U4·U5: 1977 개정 제1009조 제3항의 처 기준("동일가적내에 있는 직계비속의 상속분",
  // "직계존속의 상속분") 집단이 전부 동일가적내에 없는 여자이면 8 단위 기준은 문언 밖 보충이다.
  const base = desc.length > 0 ? desc : asc;
  if (
    period === "1979" &&
    isWife &&
    base.length > 0 &&
    base.every((h) => h.sex === "female" && h.sameFamilyRegister === false)
  ) {
    const who = desc.length > 0 ? "직계비속" : "직계존속";
    warnings.push(
      `처의 상속분 기준 불명확: 구 민법(1977 개정) 제1009조 제3항은 처의 상속분을 ${desc.length > 0 ? '"동일가적내에 있는 직계비속의 상속분"' : '"직계존속의 상속분"'}의 5할 가산으로 정하는데, 공동상속하는 ${who}이 모두 동일가적내에 없는 여자입니다. 이 계산은 기준을 남자의 상속분(동일가적내 직계비속과 같은 값)으로 보충했으며, 그 여자의 상속분(남자의 4분의 1)을 기준으로 읽으면 처의 몫이 크게 줄어듭니다. 조문에 직접 정함이 없는 해석이므로 전문가 확인이 필요합니다.`,
    );
  }

  if (desc.length > 0) {
    t("순위 결정: 1순위 직계비속 (구 민법 제1000조 제1항 제1호)");
    t(`가중치: ${weightNote}`);
    traceReps(desc);
    let spouse: { name: string; weight: bigint } | null = null;
    if (isWife) {
      spouse = { name: spouseName, weight: wifeWeight(period, true) };
      t(
        period === "1960"
          ? "처: 직계비속과 공동상속, 남자의 상속분의 1/2 (구 민법 제1003조 제1항, 제1009조 제3항)"
          : "처: 직계비속과 공동상속, 동일가적내 직계비속 상속분의 5할 가산 (구 민법 제1003조 제1항, 제1009조 제3항)",
      );
    } else if (isHusband) {
      spouse = { name: spouseName, weight: MALE };
      t(
        "남편: 처가 피상속인, 직계비속과 동순위 공동상속, 남자의 상속분으로 봄 (구 민법 제1002조, 제1009조 제1항)",
      );
    }
    return distribute(desc, period, "자녀", spouse);
  }
  if (isHusband) {
    t("순위 결정: 직계비속이 없어 남편 단독상속 (구 민법 제1002조)");
    return [{ name: spouseName, raw: { num: 1n, den: 1n } }];
  }
  if (asc.length > 0) {
    t("순위 결정: 2순위 직계존속 (구 민법 제1000조 제1항 제2호, 제2항 최근친)");
    t(`가중치: ${weightNote}`);
    let spouse: { name: string; weight: bigint } | null = null;
    if (isWife) {
      spouse = { name: spouseName, weight: wifeWeight(period, false) };
      t(
        period === "1960"
          ? "처: 직계존속과 공동상속, 남자의 상속분과 균분 (구 민법 제1003조 제1항, 제1009조 제3항)"
          : "처: 직계존속과 공동상속, 직계존속 상속분의 5할 가산 (구 민법 제1003조 제1항, 제1009조 제3항)",
      );
    }
    return distribute(asc, period, "직계존속", spouse);
  }
  if (isWife) {
    t("순위 결정: 직계비속·직계존속이 없어 처 단독상속 (구 민법 제1003조 제1항)");
    return [{ name: spouseName, raw: { num: 1n, den: 1n } }];
  }
  if (sib.length > 0) {
    t("순위 결정: 3순위 형제자매 (구 민법 제1000조 제1항 제3호)");
    t(`가중치: ${weightNote}`);
    traceReps(sib);
    return distribute(sib, period, "형제자매", null);
  }
  if (col.length > 0) {
    t("순위 결정: 4순위 8촌 이내 방계혈족 (구 민법 제1000조 제1항 제4호, 제2항 최근친)");
    t(`가중치: ${weightNote}`);
    return distribute(col, period, "방계혈족", null);
  }
  throw new RangeError("상속인이 없습니다");
}
