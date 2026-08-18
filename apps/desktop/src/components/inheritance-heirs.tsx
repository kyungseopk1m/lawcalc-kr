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

export function toHeirNode(h: HeirInput, allowRepresentation: boolean): HeirNode {
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

export function fromHeirNode(h: HeirNode): HeirInput {
  return {
    id: newHeirId(),
    name: h.name ?? "",
    deceasedBeforeOpening: h.deceasedBeforeOpening,
    ...(h.representationCause ? { representationCause: h.representationCause } : {}),
    ...(h.renounced ? { renounced: true } : {}),
    ...(h.degree !== undefined ? { degree: h.degree } : {}),
    representatives:
      h.representatives?.map((representative) => ({
        id: newHeirId(),
        name: representative.name ?? "",
        ...(representative.isSpouseOfRepresented ? { isSpouseOfRepresented: true } : {}),
        ...(representative.renounced ? { renounced: true } : {}),
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
  return {
    decedent: state.decedent.name.trim()
      ? { name: state.decedent.name.trim(), deceasedAt: state.decedent.deceasedAt }
      : { deceasedAt: state.decedent.deceasedAt },
    ...(state.spouse.alive
      ? {
          spouse: state.spouse.name.trim()
            ? { name: state.spouse.name.trim(), alive: true }
            : { alive: true },
        }
      : {}),
    ...(state.linealDescendants.length > 0
      ? { linealDescendants: state.linealDescendants.map((h) => toHeirNode(h, true)) }
      : {}),
    ...(state.linealAscendants.length > 0
      ? { linealAscendants: state.linealAscendants.map((h) => toHeirNode(h, false)) }
      : {}),
    ...(state.siblings.length > 0
      ? { siblings: state.siblings.map((h) => toHeirNode(h, true)) }
      : {}),
    ...(state.collateralFourth.length > 0
      ? { collateralFourth: state.collateralFourth.map((h) => toHeirNode(h, false)) }
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
    representatives: heir.representatives.map((representative) => ({
      name: representative.name,
      isSpouseOfRepresented: representative.isSpouseOfRepresented ?? false,
      renounced: representative.renounced ?? false,
    })),
  }));
}

export interface HeirGroupCardProps {
  title: string;
  hint: string;
  heirs: HeirInput[];
  onChange: (heirs: HeirInput[]) => void;
  allowRepresentation: boolean;
  defaultLabel: string;
  /** 촌수 선택 옵션 (직계존속·방계 4순위). 지정 시 각 상속인에 촌수 select 표시 + 추가 시 최근친 기본값. */
  degreeOptions?: DegreeOption[];
}

export function HeirGroupCard({
  title,
  hint,
  heirs,
  onChange,
  allowRepresentation,
  defaultLabel,
  degreeOptions,
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
                    ...(e.target.checked ? { renounced: false } : {}),
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
                  <option value="forfeited">상속권 상실선고 (제1004조의2)</option>
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
                      피대습자의 배우자, 5할 가산 (제1009조 제2항)
                    </label>
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
