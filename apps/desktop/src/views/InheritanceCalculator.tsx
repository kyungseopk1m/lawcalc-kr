/**
 * 상속분 간이 계산 (inheritance v0.2) — Desktop UI 첫 commit.
 *
 * scope: 입력 + 계산 + 화면 결과 + 한국어 inline error. PDF/CSV/.lcalc 0건 (후속 commit).
 *
 * 입력 모델 출처: `for-claude/.../inheritance-input-model-spike-2026-05-09.md` §5,
 * UI 라벨 출처: `source-extraction-spike-2026-05-09.md` §8.3 (UI strings verbatim).
 */
import { CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
import { useState } from "react";

import {
  STANDARD_DISCLAIMER,
  calculateInheritance,
  type HeirNode,
  type InheritanceInput,
  type InheritanceResult,
} from "@lawcalc-kr/core-engine";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";

interface HeirInput {
  id: string;
  name: string;
  deceasedBeforeOpening: boolean;
  representatives: { id: string; name: string }[];
}

interface SpouseInput {
  alive: boolean;
  name: string;
}

interface DecedentInput {
  name: string;
  deceasedAt: string;
}

function newId(): string {
  return crypto.randomUUID();
}

function emptyHeir(): HeirInput {
  return { id: newId(), name: "", deceasedBeforeOpening: false, representatives: [] };
}

function toHeirNode(h: HeirInput, allowRepresentation: boolean): HeirNode {
  const node: HeirNode = {
    name: h.name.trim() || undefined,
    deceasedBeforeOpening: h.deceasedBeforeOpening,
  };
  if (allowRepresentation && h.deceasedBeforeOpening && h.representatives.length > 0) {
    node.representatives = h.representatives.map((r) => ({
      name: r.name.trim() || undefined,
      deceasedBeforeOpening: false,
    }));
  }
  return node;
}

interface HeirGroupCardProps {
  title: string;
  hint: string;
  heirs: HeirInput[];
  onChange: (heirs: HeirInput[]) => void;
  allowRepresentation: boolean;
  defaultLabel: string;
}

function HeirGroupCard({
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
          ? { ...h, representatives: [...h.representatives, { id: newId(), name: "" }] }
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

function formatPercent(num: number, den: number): string {
  if (den === 0) return "—";
  return `${((num / den) * 100).toFixed(2)}%`;
}

function formatComputedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function InheritanceCalculator() {
  const [decedent, setDecedent] = useState<DecedentInput>({
    name: "",
    deceasedAt: "2025-01-01",
  });
  const [spouse, setSpouse] = useState<SpouseInput>({ alive: true, name: "" });
  const [linealDescendants, setLinealDescendants] = useState<HeirInput[]>([]);
  const [linealAscendants, setLinealAscendants] = useState<HeirInput[]>([]);
  const [siblings, setSiblings] = useState<HeirInput[]>([]);
  const [collateralFourth, setCollateralFourth] = useState<HeirInput[]>([]);
  const [result, setResult] = useState<InheritanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = () => {
    const input: InheritanceInput = {
      decedent: {
        name: decedent.name.trim() || undefined,
        deceasedAt: decedent.deceasedAt,
      },
      spouse: spouse.alive ? { name: spouse.name.trim() || undefined, alive: true } : undefined,
      linealDescendants:
        linealDescendants.length > 0
          ? linealDescendants.map((h) => toHeirNode(h, true))
          : undefined,
      linealAscendants:
        linealAscendants.length > 0 ? linealAscendants.map((h) => toHeirNode(h, false)) : undefined,
      siblings: siblings.length > 0 ? siblings.map((h) => toHeirNode(h, true)) : undefined,
      collateralFourth:
        collateralFourth.length > 0 ? collateralFourth.map((h) => toHeirNode(h, false)) : undefined,
    };

    try {
      const r = calculateInheritance(input);
      setResult(r);
      setError(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReset = () => {
    setDecedent({ name: "", deceasedAt: "2025-01-01" });
    setSpouse({ alive: true, name: "" });
    setLinealDescendants([]);
    setLinealAscendants([]);
    setSiblings([]);
    setCollateralFourth([]);
    setResult(null);
    setError(null);
  };

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[580px_minmax(0,1fr)]">
      <div className="grid gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">피상속인</CardTitle>
            <p className="text-xs text-muted-foreground">
              1991-01-01 이후 사망 케이스만 지원합니다 (1990 개정민법 시행).
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <label className="grid gap-2 text-sm font-medium">
              이름 (선택)
              <Input
                placeholder="예: 피상속인"
                value={decedent.name}
                onChange={(e) => setDecedent({ ...decedent, name: e.target.value })}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              사망일
              <Input
                type="date"
                value={decedent.deceasedAt}
                onChange={(e) => setDecedent({ ...decedent, deceasedAt: e.target.value })}
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">배우자</CardTitle>
            <p className="text-xs text-muted-foreground">
              1·2순위와 동순위 공동 (민법 1003조). 배우자는 한 명 이상 입력할 수 없습니다.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={spouse.alive}
                onChange={(e) => setSpouse({ ...spouse, alive: e.target.checked })}
              />
              배우자 생존
            </label>
            {spouse.alive ? (
              <label className="grid gap-2 text-sm font-medium">
                이름 (선택)
                <Input
                  placeholder="예: 배우자"
                  value={spouse.name}
                  onChange={(e) => setSpouse({ ...spouse, name: e.target.value })}
                />
              </label>
            ) : null}
          </CardContent>
        </Card>

        <HeirGroupCard
          title="1순위 — 직계비속"
          hint="자녀·손자녀 등. 사망 시 그 직계비속 (피상속인의 손자녀) 이 1차 대습."
          heirs={linealDescendants}
          onChange={setLinealDescendants}
          allowRepresentation={true}
          defaultLabel="자녀"
        />

        <HeirGroupCard
          title="2순위 — 직계존속"
          hint="부·모·조부모. 1순위 부재 시에만 분배 참여. 대습상속 대상 아님 (1001조)."
          heirs={linealAscendants}
          onChange={setLinealAscendants}
          allowRepresentation={false}
          defaultLabel="직계존속"
        />

        <HeirGroupCard
          title="3순위 — 형제자매"
          hint="1·2순위·배우자 모두 부재 시에만. 사망 시 그 직계비속 (조카) 이 1차 대습 가능."
          heirs={siblings}
          onChange={setSiblings}
          allowRepresentation={true}
          defaultLabel="형제자매"
        />

        <HeirGroupCard
          title="4순위 — 4촌이내 방계혈족"
          hint="1·2·3순위·배우자 모두 부재 시에만. 대습상속 대상 아님."
          heirs={collateralFourth}
          onChange={setCollateralFourth}
          allowRepresentation={false}
          defaultLabel="방계혈족"
        />

        <div className="flex gap-2">
          <Button onClick={handleCalculate} type="button">
            계산
          </Button>
          <Button onClick={handleReset} variant="outline" type="button">
            초기화
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {result ? (
          <>
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm text-muted-foreground">최종 상속 지분</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">상속인</th>
                      <th className="py-2 font-medium">지분 (약분)</th>
                      <th className="py-2 font-medium">약분 전</th>
                      <th className="py-2 font-medium text-right">백분율 (참고)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.shares.map((s, i) => (
                      <tr key={`${s.name}-${i}`} className="border-b border-border last:border-b-0">
                        <td className="py-2">{s.name}</td>
                        <td className="py-2 font-mono">
                          {s.numerator}/{s.denominator}
                        </td>
                        <td className="py-2 font-mono text-xs text-muted-foreground">
                          {s.rawNumerator}/{s.rawDenominator}
                        </td>
                        <td className="py-2 text-right text-xs text-muted-foreground">
                          {formatPercent(s.numerator, s.denominator)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="grid gap-2 p-4 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-foreground">데이터 버전</dt>
                  <dd>{result.dataVersion}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">계산 시각</dt>
                  <dd>{formatComputedAt(result.computedAt)}</dd>
                </div>
                {result.decedent.name ? (
                  <div>
                    <dt className="font-medium text-foreground">피상속인</dt>
                    <dd>{result.decedent.name}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="font-medium text-foreground">사망일</dt>
                  <dd>{result.decedent.deceasedAt}</dd>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{result.disclaimer || STANDARD_DISCLAIMER}</span>
            </div>
          </>
        ) : null}

        {!result && !error ? (
          <Card>
            <CardContent className="grid gap-2 p-6 text-sm text-muted-foreground">
              <p>
                좌측에서 피상속인 사망일과 상속인 그룹을 입력한 후{" "}
                <span className="font-medium text-foreground">계산</span> 버튼을 누르세요.
              </p>
              <p className="text-xs">
                근거: 민법 제1000·1001·1003·1009·1010조. 본 버전은 1차 대습까지만 지원하며, 2차 이상
                대습은 거부됩니다.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
