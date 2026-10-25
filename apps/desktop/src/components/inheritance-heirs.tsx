import { Plus, Trash2 } from "lucide-react";

import type { HeirNode, InheritanceInput } from "@lawcalc-kr/core-engine";

import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

/**
 * 상속인 입력 공유 컴포넌트.
 *
 * 상속분 계산 탭(`InheritanceCalculator`)과 자×사망 손해배상 탭(`CompensationCalculator`)이
 * 동일한 상속인 입력 UI를 사용하도록 추출한 모듈. 입력 모델(`HeirInput`/`SpouseInput`/
 * `DecedentInput`)과 도메인 입력(`InheritanceInput`/`HeirNode`) 간 변환 헬퍼를 함께 제공한다.
 */
export interface RepInput {
  id: string;
  name: string;
  /** 피대습자의 배우자(며느리·사위)인지 — 제1009조 제2항 5할 가산 대상. */
  isSpouseOfRepresented?: boolean;
  /** 대습상속인 본인의 상속포기. */
  renounced?: boolean;
  /** 구법(1991 전 사망) 전용. 성별·동일가적 여부 (구 민법 제1009조). */
  sex?: Sex | undefined;
  sameFamilyRegister?: boolean | undefined;
}

export type Sex = "male" | "female";

/** 구법 입력을 받는 사망일 (1991-01-01 전). 1960 전은 엔진이 관습법 안내로 거부한다. */
export function isOldLawDate(deceasedAt: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(deceasedAt) && deceasedAt < "1991-01-01";
}

export type RepresentationCause = "death" | "disqualified" | "forfeited";

export interface HeirInput {
  id: string;
  name: string;
  deceasedBeforeOpening: boolean;
  /**
   * 대습 원인. 제1003조 제2항이 2026-03-17 개정으로 대습 배우자를 "상속개시전에 사망한
   * 사람의 배우자" 로 좁혀, 시행일 이후 개시 상속에서는 원인에 따라 금액이 갈린다.
   */
  representationCause?: RepresentationCause;
  /** 상속포기 (제1041조·제1042조). 사망·결격과 별개 사유다 — 포기는 대습 원인이 아니다(제1001조). */
  renounced?: boolean;
  /** 촌수 — 직계존속·방계 4순위에서 최근친 우선 판정(제1000조 제2항). 그 외 그룹은 미사용. */
  degree?: number;
  /** 구법 전용. 성별·동일가적 여부·호주상속 (구 민법 제1009조). 1991 이후 사망이면 싣지 않는다. */
  sex?: Sex | undefined;
  sameFamilyRegister?: boolean | undefined;
  hojuSuccessor?: boolean;
  representatives: RepInput[];
}

/** 촌수 선택 옵션 (직계존속·방계 4순위 그룹에 전달). */
export interface DegreeOption {
  value: number;
  label: string;
}

export interface SpouseInput {
  alive: boolean;
  name: string;
  /** 구법 전용. 처(제1003조·제1009조 제3항)와 남편(제1002조)을 다르게 다룬다. */
  relation?: "wife" | "husband" | undefined;
}

export interface DecedentInput {
  name: string;
  deceasedAt: string;
}

export function newHeirId(): string {
  return crypto.randomUUID();
}

export function emptyHeir(): HeirInput {
  return { id: newHeirId(), name: "", deceasedBeforeOpening: false, representatives: [] };
}

/** 구법 필드 복사. 여자일 때만 동일가적 여부를 싣는다 (남자는 상속분에 영향 없음). */
function oldLawFields(p: {
  sex?: Sex | undefined;
  sameFamilyRegister?: boolean | undefined;
}): Partial<HeirNode> {
  return {
    ...(p.sex ? { sex: p.sex } : {}),
    ...(p.sex === "female" && p.sameFamilyRegister !== undefined
      ? { sameFamilyRegister: p.sameFamilyRegister }
      : {}),
  };
}

export function toHeirNode(h: HeirInput, allowRepresentation: boolean, oldLaw = false): HeirNode {
  const node: HeirNode = {
    deceasedBeforeOpening: h.deceasedBeforeOpening,
  };
  const name = h.name.trim();
  if (name) {
    node.name = name;
  }
  if (h.renounced) {
    node.renounced = true;
  }
  if (h.deceasedBeforeOpening && h.representationCause && h.representationCause !== "death") {
    node.representationCause = h.representationCause;
  }
  if (h.degree !== undefined) {
    node.degree = h.degree;
  }
  if (oldLaw) {
    Object.assign(node, oldLawFields(h), h.hojuSuccessor ? { hojuSuccessor: true } : {});
  }
  if (allowRepresentation && h.deceasedBeforeOpening && h.representatives.length > 0) {
    node.representatives = h.representatives.map((r) => {
      const representative: HeirNode = { deceasedBeforeOpening: false };
      const representativeName = r.name.trim();
      if (representativeName) {
        representative.name = representativeName;
      }
      if (r.isSpouseOfRepresented) {
        representative.isSpouseOfRepresented = true;
      }
      if (r.renounced) {
        representative.renounced = true;
      }
      if (oldLaw && !r.isSpouseOfRepresented) {
        Object.assign(representative, oldLawFields(r));
      }
      return representative;
    });
  }
  return node;
}

/**
 * `inheritance@2` 로 올려야 하는 파일인지 — 새 의미 필드가 실제로 담겼는지 본다.
 *
 * optional 필드는 **구파일 → 신앱** 방향만 안전하다. 반대 방향에서 구앱이 이 필드를 버리면
 * 포기자가 지분을 받고(배우자 3/5·자녀A 2/5 → 3/7·2/7·2/7), 결격 대습이 사망 대습으로
 * 되돌아가 피대습자 배우자에게 없는 지분이 생긴다. 둘 다 경고 없는 금액 변경이다.
 */
export function hasInheritanceV2Fields(input: InheritanceInput): boolean {
  const walk = (nodes: HeirNode[] | undefined): boolean =>
    (nodes ?? []).some(
      (n) =>
        n.renounced === true ||
        (n.representationCause !== undefined && n.representationCause !== "death") ||
        walk(n.representatives),
    );
  return [
    input.linealDescendants,
    input.linealAscendants,
    input.siblings,
    input.collateralFourth,
  ].some(walk);
}

/**
 * `inheritance@4` 로 올려야 하는 파일인지. 구법 필드가 담겼는지 본다. 구앱은 이 필드를 버리고
 * 1991 전 사망을 거부하거나 다른 지분을 낼 수 있으므로 capability 로 막는다.
 */
export function hasInheritanceOldLawFields(input: InheritanceInput): boolean {
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

export function fromHeirNode(h: HeirNode): HeirInput {
  return {
    id: newHeirId(),
    name: h.name ?? "",
    deceasedBeforeOpening: h.deceasedBeforeOpening,
    ...(h.representationCause ? { representationCause: h.representationCause } : {}),
    ...(h.renounced ? { renounced: true } : {}),
    ...(h.degree !== undefined ? { degree: h.degree } : {}),
    ...(h.sex ? { sex: h.sex } : {}),
    ...(h.sameFamilyRegister !== undefined ? { sameFamilyRegister: h.sameFamilyRegister } : {}),
    ...(h.hojuSuccessor ? { hojuSuccessor: true } : {}),
    representatives:
      h.representatives?.map((representative) => ({
        id: newHeirId(),
        name: representative.name ?? "",
        ...(representative.isSpouseOfRepresented ? { isSpouseOfRepresented: true } : {}),
        ...(representative.renounced ? { renounced: true } : {}),
        ...(representative.sex ? { sex: representative.sex } : {}),
        ...(representative.sameFamilyRegister !== undefined
          ? { sameFamilyRegister: representative.sameFamilyRegister }
          : {}),
      })) ?? [],
  };
}

export interface HeirGroupsState {
  decedent: DecedentInput;
  spouse: SpouseInput;
  linealDescendants: HeirInput[];
  linealAscendants: HeirInput[];
  siblings: HeirInput[];
  collateralFourth: HeirInput[];
}

/** 상속인 입력 그룹 → `InheritanceInput` 변환 (배우자/순위별 누락 시 생략). */
export function buildInheritanceInput(state: HeirGroupsState): InheritanceInput {
  // 구법 필드는 1991 전 사망일 때만 싣는다. 1991 이후 입력은 종전과 바이트 단위로 같다.
  const oldLaw = isOldLawDate(state.decedent.deceasedAt);
  return {
    decedent: state.decedent.name.trim()
      ? { name: state.decedent.name.trim(), deceasedAt: state.decedent.deceasedAt }
      : { deceasedAt: state.decedent.deceasedAt },
    ...(state.spouse.alive
      ? {
          spouse: {
            ...(state.spouse.name.trim() ? { name: state.spouse.name.trim() } : {}),
            alive: true,
            ...(oldLaw && state.spouse.relation ? { relation: state.spouse.relation } : {}),
          },
        }
      : {}),
    ...(state.linealDescendants.length > 0
      ? { linealDescendants: state.linealDescendants.map((h) => toHeirNode(h, true, oldLaw)) }
      : {}),
    ...(state.linealAscendants.length > 0
      ? { linealAscendants: state.linealAscendants.map((h) => toHeirNode(h, false, oldLaw)) }
      : {}),
    ...(state.siblings.length > 0
      ? { siblings: state.siblings.map((h) => toHeirNode(h, true, oldLaw)) }
      : {}),
    ...(state.collateralFourth.length > 0
      ? { collateralFourth: state.collateralFourth.map((h) => toHeirNode(h, false, oldLaw)) }
      : {}),
  };
}

/** `InheritanceInput` → 상속인 입력 그룹 (불러오기). */
export function applyInheritanceInput(input: InheritanceInput): HeirGroupsState {
  return {
    decedent: {
      name: input.decedent.name ?? "",
      deceasedAt: input.decedent.deceasedAt,
    },
    spouse: {
      alive: input.spouse?.alive ?? false,
      name: input.spouse?.name ?? "",
      ...(input.spouse?.relation ? { relation: input.spouse.relation } : {}),
    },
    linealDescendants: input.linealDescendants?.map(fromHeirNode) ?? [],
    // 직계존속·방계는 촌수 그룹 — 미지정 legacy 입력은 최근친(부모 1촌 / 삼촌 3촌)으로 기본 표기.
    linealAscendants:
      input.linealAscendants?.map((h) => ({ ...fromHeirNode(h), degree: h.degree ?? 1 })) ?? [],
    siblings: input.siblings?.map(fromHeirNode) ?? [],
    collateralFourth:
      input.collateralFourth?.map((h) => ({ ...fromHeirNode(h), degree: h.degree ?? 3 })) ?? [],
  };
}

export function heirsForDirtySnapshot(heirs: HeirInput[]) {
  return heirs.map((heir) => ({
    name: heir.name,
    deceasedBeforeOpening: heir.deceasedBeforeOpening,
    renounced: heir.renounced ?? false,
    degree: heir.degree,
    // 구법 필드는 값이 있을 때만 싣는다. JSON 스냅숏에서 undefined 는 빠지므로 종전 스냅숏과 같다.
    sex: heir.sex,
    sameFamilyRegister: heir.sameFamilyRegister,
    hojuSuccessor: heir.hojuSuccessor || undefined,
    representatives: heir.representatives.map((representative) => ({
      name: representative.name,
      isSpouseOfRepresented: representative.isSpouseOfRepresented ?? false,
      renounced: representative.renounced ?? false,
      sex: representative.sex,
      sameFamilyRegister: representative.sameFamilyRegister,
    })),
  }));
}

/**
 * 상속 순위별 입력 안내. 상속분 탭과 손해배상 사망 탭이 같은 상속 엔진을 재사용하므로
 * 안내도 한 곳에서만 정의한다. 뷰마다 따로 두면 문구가 갈린다.
 */
export const HEIR_GROUP_HINTS = {
  linealDescendants: "자녀·손자녀 등. 사망 시 그 직계비속(피상속인의 손자녀)이 1차 대습.",
  linealAscendants:
    "각 직계존속의 촌수를 고르세요. 부모(1촌)·조부모(2촌) 중 최근친만 상속합니다. 부모가 있으면 조부모는 자동 제외 (제1000조 제2항). 1순위 부재 시에만 참여. 대습상속 대상 아님 (제1001조).",
  siblings: "1·2순위·배우자 모두 부재 시에만. 사망 시 그 직계비속(조카)이 1차 대습 가능.",
  collaterals:
    "1·2·3순위·배우자 모두 부재 시에만. 각 방계혈족의 촌수를 고르세요. 3촌(예: 삼촌)이 4촌(예: 사촌)에 우선해 최근친만 상속합니다 (제1000조 제2항). 대습상속 대상 아님.",
} as const;

export interface HeirGroupCardProps {
  title: string;
  hint: string;
  heirs: HeirInput[];
  onChange: (heirs: HeirInput[]) => void;
  allowRepresentation: boolean;
  defaultLabel: string;
  /** 촌수 선택 옵션 (직계존속·방계 4순위). 지정 시 각 상속인에 촌수 select 표시 + 추가 시 최근친 기본값. */
  degreeOptions?: DegreeOption[];
  /** 구법(1991 전 사망) 입력. 성별·동일가적 여부를 받는다. 미지정이면 종전 화면 그대로. */
  oldLaw?: boolean;
  /** 구법 호주상속인 체크 표시 (1순위 직계비속 카드만). */
  allowHoju?: boolean;
}

const selectClass =
  "rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground";

/**
 * 구법 성별·동일가적 입력. 동일가적 여부는 체크박스가 아니라 선택으로 받는다. 기본값이
 * "가적 밖" 으로 잡히면 아무 표시 없이 남자의 4분의 1로 계산되기 때문이다.
 */
function OldLawPersonFields({
  value,
  onChange,
}: {
  value: { sex?: Sex | undefined; sameFamilyRegister?: boolean | undefined };
  onChange: (patch: { sex?: Sex | undefined; sameFamilyRegister?: boolean | undefined }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <label className="flex items-center gap-1">
        성별
        <select
          aria-label="성별"
          className={selectClass}
          value={value.sex ?? ""}
          onChange={(e) => onChange({ sex: (e.target.value || undefined) as Sex | undefined })}
        >
          <option value="">선택</option>
          <option value="male">남자</option>
          <option value="female">여자</option>
        </select>
      </label>
      {value.sex === "female" ? (
        <label className="flex items-center gap-1">
          가적
          <select
            aria-label="동일가적 여부"
            className={selectClass}
            value={value.sameFamilyRegister === undefined ? "" : String(value.sameFamilyRegister)}
            onChange={(e) =>
              onChange({
                sameFamilyRegister: e.target.value === "" ? undefined : e.target.value === "true",
              })
            }
          >
            <option value="">선택</option>
            <option value="true">피상속인과 동일가적</option>
            <option value="false">동일가적 밖 (출가 등), 남자의 1/4</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}

export function HeirGroupCard({
  title,
  hint,
  heirs,
  onChange,
  allowRepresentation,
  defaultLabel,
  degreeOptions,
  oldLaw = false,
  allowHoju = false,
}: HeirGroupCardProps) {
  const update = (idx: number, patch: Partial<HeirInput>) => {
    onChange(heirs.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  };
  const remove = (idx: number) => {
    onChange(heirs.filter((_, i) => i !== idx));
  };
  const addHeir = () => {
    const fresh = emptyHeir();
    onChange([...heirs, degreeOptions ? { ...fresh, degree: degreeOptions[0]!.value } : fresh]);
  };
  const addRep = (idx: number) => {
    onChange(
      heirs.map((h, i) =>
        i === idx
          ? { ...h, representatives: [...h.representatives, { id: newHeirId(), name: "" }] }
          : h,
      ),
    );
  };
  const updateRep = (idx: number, repIdx: number, patch: Partial<RepInput>) => {
    onChange(
      heirs.map((h, i) =>
        i === idx
          ? {
              ...h,
              representatives: h.representatives.map((r, j) =>
                j === repIdx ? { ...r, ...patch } : r,
              ),
            }
          : h,
      ),
    );
  };
  const removeRep = (idx: number, repIdx: number) => {
    onChange(
      heirs.map((h, i) =>
        i === idx ? { ...h, representatives: h.representatives.filter((_, j) => j !== repIdx) } : h,
      ),
    );
  };

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-0">
        {heirs.map((h, idx) => (
          <div key={h.id} className="grid gap-2 rounded-md border border-input p-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder={`예: ${defaultLabel}${idx + 1}`}
                value={h.name}
                onChange={(e) => update(idx, { name: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="삭제"
                onClick={() => remove(idx)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {degreeOptions ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                촌수
                <select
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
                  value={String(h.degree ?? degreeOptions[0]!.value)}
                  onChange={(e) => update(idx, { degree: Number(e.target.value) })}
                >
                  {degreeOptions.map((opt) => (
                    <option key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="text-[11px]">최근친만 상속 (제1000조 제2항)</span>
              </label>
            ) : null}
            {oldLaw ? (
              <OldLawPersonFields value={h} onChange={(patch) => update(idx, patch)} />
            ) : null}
            {oldLaw && allowHoju && !h.deceasedBeforeOpening ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={h.hojuSuccessor ?? false}
                  onChange={(e) => update(idx, { hojuSuccessor: e.target.checked })}
                />
                호주상속인, 고유 상속분 5할 가산 (구 민법 제1009조 제1항)
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={h.deceasedBeforeOpening}
                onChange={(e) =>
                  update(idx, {
                    deceasedBeforeOpening: e.target.checked,
                    representatives: e.target.checked ? h.representatives : [],
                    // 포기와 배타 — 상속개시 전에 사망한 사람은 포기할 수 없고, 결격자는
                    // 포기할 지분이 없다. 엔진도 이 조합을 거부한다.
                    // 대습 호주상속 가산은 계산하지 않으므로 호주 표시도 함께 지운다.
                    ...(e.target.checked ? { renounced: false, hojuSuccessor: false } : {}),
                  })
                }
              />
              상속개시 전 사망·결격·상속권 상실
            </label>
            {h.deceasedBeforeOpening ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>대습 원인</span>
                <select
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                  value={h.representationCause ?? "death"}
                  onChange={(e) =>
                    update(idx, { representationCause: e.target.value as RepresentationCause })
                  }
                >
                  <option value="death">상속개시 전 사망</option>
                  <option value="disqualified">상속결격 (제1004조)</option>
                  {/* 상속권 상실선고는 1991 이후 신설 제도라 구법 사건에는 없다 (엔진도 거부). */}
                  {oldLaw ? null : <option value="forfeited">상속권 상실선고 (제1004조의2)</option>}
                </select>
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={h.renounced ?? false}
                onChange={(e) =>
                  update(idx, {
                    renounced: e.target.checked,
                    // 포기를 고르면 대습 입력을 비운다. 남겨 두면 화면에는 대습상속인이
                    // 보이는데 결과표에서만 사라진다.
                    ...(e.target.checked
                      ? { deceasedBeforeOpening: false, representatives: [] }
                      : {}),
                  })
                }
              />
              상속포기 (제1041조)
            </label>
            {h.renounced ? (
              <p className="text-[11px] text-muted-foreground">
                포기자는 상속개시시부터 상속인이 아니었던 것으로 봅니다(제1042조). 포기는 대습
                원인이 아니므로(제1001조) 대습상속인이 생기지 않습니다.
              </p>
            ) : null}
            {allowRepresentation && h.deceasedBeforeOpening ? (
              <div className="grid gap-2 border-t border-border pt-2">
                <p className="text-xs font-medium text-foreground">대습상속인 (1차)</p>
                {h.representatives.map((r, repIdx) => (
                  <div key={r.id} className="grid gap-1">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder={`예: ${h.name || `${defaultLabel}${idx + 1}`}의 대습${repIdx + 1}`}
                        value={r.name}
                        onChange={(e) => updateRep(idx, repIdx, { name: e.target.value })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="대습 삭제"
                        onClick={() => removeRep(idx, repIdx)}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={r.isSpouseOfRepresented ?? false}
                        onChange={(e) =>
                          updateRep(idx, repIdx, { isSpouseOfRepresented: e.target.checked })
                        }
                      />
                      {oldLaw
                        ? "피대습자의 처 (구 민법 제1003조 제2항, 사위 대습 없음)"
                        : "피대습자의 배우자, 5할 가산 (제1009조 제2항)"}
                    </label>
                    {oldLaw && !r.isSpouseOfRepresented ? (
                      <OldLawPersonFields
                        value={r}
                        onChange={(patch) => updateRep(idx, repIdx, patch)}
                      />
                    ) : null}
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={r.renounced ?? false}
                        onChange={(e) => updateRep(idx, repIdx, { renounced: e.target.checked })}
                      />
                      이 대습상속인의 상속포기 (제1041조)
                    </label>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addRep(idx)}
                  type="button"
                  className="w-fit"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  대습 추가
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addHeir} type="button" className="w-fit">
          <Plus className="mr-1 h-3 w-3" />
          {defaultLabel} 추가
        </Button>
      </CardContent>
    </Card>
  );
}
