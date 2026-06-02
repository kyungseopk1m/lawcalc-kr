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
export interface HeirInput {
  id: string;
  name: string;
  deceasedBeforeOpening: boolean;
  representatives: { id: string; name: string }[];
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
  if (allowRepresentation && h.deceasedBeforeOpening && h.representatives.length > 0) {
    node.representatives = h.representatives.map((r) => {
      const representative: HeirNode = { deceasedBeforeOpening: false };
      const representativeName = r.name.trim();
      if (representativeName) {
        representative.name = representativeName;
      }
      return representative;
    });
  }
  return node;
}

export function fromHeirNode(h: HeirNode): HeirInput {
  return {
    id: newHeirId(),
    name: h.name ?? "",
    deceasedBeforeOpening: h.deceasedBeforeOpening,
    representatives:
      h.representatives?.map((representative) => ({
        id: newHeirId(),
        name: representative.name ?? "",
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
    linealAscendants: input.linealAscendants?.map(fromHeirNode) ?? [],
    siblings: input.siblings?.map(fromHeirNode) ?? [],
    collateralFourth: input.collateralFourth?.map(fromHeirNode) ?? [],
  };
}

export function heirsForDirtySnapshot(heirs: HeirInput[]) {
  return heirs.map((heir) => ({
    name: heir.name,
    deceasedBeforeOpening: heir.deceasedBeforeOpening,
    representatives: heir.representatives.map((representative) => ({
      name: representative.name,
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
}

export function HeirGroupCard({
  title,
  hint,
  heirs,
  onChange,
  allowRepresentation,
  defaultLabel,
}: HeirGroupCardProps) {
  const update = (idx: number, patch: Partial<HeirInput>) => {
    onChange(heirs.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  };
  const remove = (idx: number) => {
    onChange(heirs.filter((_, i) => i !== idx));
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
  const updateRep = (idx: number, repIdx: number, name: string) => {
    onChange(
      heirs.map((h, i) =>
        i === idx
          ? {
              ...h,
              representatives: h.representatives.map((r, j) => (j === repIdx ? { ...r, name } : r)),
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
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={h.deceasedBeforeOpening}
                onChange={(e) =>
                  update(idx, {
                    deceasedBeforeOpening: e.target.checked,
                    representatives: e.target.checked ? h.representatives : [],
                  })
                }
              />
              상속개시 전 사망 (또는 결격)
            </label>
            {allowRepresentation && h.deceasedBeforeOpening ? (
              <div className="grid gap-2 border-t border-border pt-2">
                <p className="text-xs font-medium text-foreground">대습상속인 (1차)</p>
                {h.representatives.map((r, repIdx) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <Input
                      placeholder={`예: ${h.name || `${defaultLabel}${idx + 1}`}의 대습${repIdx + 1}`}
                      value={r.name}
                      onChange={(e) => updateRep(idx, repIdx, e.target.value)}
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...heirs, emptyHeir()])}
          type="button"
          className="w-fit"
        >
          <Plus className="mr-1 h-3 w-3" />
          {defaultLabel} 추가
        </Button>
      </CardContent>
    </Card>
  );
}
