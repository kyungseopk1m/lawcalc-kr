import { useMemo, useState } from "react";

import {
  STANDARD_DISCLAIMER,
  buildDetentionTable,
  computeDetentionDays,
  type DetentionBasis,
  type DetentionInput,
  type DetentionResult,
} from "@lawcalc-kr/core-engine";

import { Button } from "../components/ui/button";
import { CopyButton } from "../components/ui/copy-button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Notice } from "../components/ui/notice";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { FormulaCell } from "../components/result/FormulaCell";
import { useFormShortcuts } from "../hooks/use-form-shortcuts";
import { todayIso } from "../lib/today";
import { MonthGrid } from "./ServiceEffectCalculator";

const BASIS_LABEL: Record<DetentionBasis, string> = {
  sentencing: "판결선고일 기준 (구금 시작일 산입, 선고일 불산입)",
  release: "석방일 기준 (구금 시작일과 석방일 모두 산입)",
};

function emptyDetentionForm(): DetentionInput {
  const today = todayIso();
  return { startDate: today, baseDate: today, basis: "sentencing" };
}

function formatDetentionForClipboard(input: DetentionInput, result: DetentionResult): string {
  return [
    "LawCalc Korea 미결구금일수 계산 결과",
    `구금 시작일: ${input.startDate}`,
    `${input.basis === "release" ? "석방일" : "판결선고일"}: ${input.baseDate}`,
    `기준: ${BASIS_LABEL[input.basis]}`,
    `미결구금일수: ${result.days}일`,
    `적용 조문: ${result.articles.join(", ")}`,
    `산출 근거: ${result.formulaText}`,
    "",
    STANDARD_DISCLAIMER,
  ].join("\n");
}

function compute(input: DetentionInput) {
  try {
    return { result: computeDetentionDays(input), error: null };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function table(baseDate: string, basis: DetentionBasis) {
  try {
    return buildDetentionTable(baseDate, basis);
  } catch {
    return [];
  }
}

export function DetentionCalculator({ active = true }: { active?: boolean }) {
  const [form, setForm] = useState<DetentionInput>(emptyDetentionForm);

  const { result, error } = useMemo(() => compute(form), [form]);
  const rows = useMemo(() => table(form.baseDate, form.basis), [form.baseDate, form.basis]);
  const baseLabel = form.basis === "release" ? "석방일" : "판결선고일";

  const update = (patch: Partial<DetentionInput>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleReset = () => {
    setForm(emptyDetentionForm());
  };

  useFormShortcuts({ onReset: handleReset, enabled: active });

  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 content-start items-start gap-4 px-4 py-4 sm:px-6 md:grid-cols-2 lg:grid-cols-[520px_minmax(0,1fr)]">
      <div className="grid content-start gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">미결구금일수 입력</CardTitle>
            <p className="text-xs text-muted-foreground">
              형법 제57조 (판결선고 전 구금일수의 통산): 판결선고 전의 구금일수는 그 전부를 형에
              산입하고, 구금일수 1일은 형기 1일로 계산합니다.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <label className="grid gap-2 text-sm font-medium">
              기준
              <Select
                value={form.basis}
                onChange={(e) => update({ basis: e.target.value as DetentionBasis })}
              >
                <option value="sentencing">{BASIS_LABEL.sentencing}</option>
                <option value="release">{BASIS_LABEL.release}</option>
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              구금 시작일 (체포·구속일)
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => update({ startDate: e.target.value })}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              기준일 ({baseLabel})
              <Input
                type="date"
                value={form.baseDate}
                onChange={(e) => update({ baseDate: e.target.value })}
              />
            </label>
            <div className="flex gap-2">
              <Button onClick={handleReset} variant="outline" type="button">
                초기화
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="result-column grid content-start gap-4">
        {error ? <Notice tone="error">{error}</Notice> : null}

        {result ? (
          <>
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">계산 결과</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 pt-0">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">미결구금일수</span>
                  <span className="text-right text-base font-semibold" data-testid="detention-days">
                    {result.days}일
                  </span>
                </div>
                <div className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">산출 근거</span>
                  <FormulaCell formula={result.formulaText} />
                </div>
                <span className="text-xs text-muted-foreground">
                  적용 조문: {result.articles.join(", ")}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton
                    key={JSON.stringify(form)}
                    getText={() => formatDetentionForClipboard(form, result)}
                  />
                </div>
              </CardContent>
            </Card>

            <Notice tone="info">
              <span>{STANDARD_DISCLAIMER}</span>
            </Notice>
          </>
        ) : null}

        {rows.length > 0 ? (
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">기준일까지 일수표</CardTitle>
              <p className="text-xs text-muted-foreground">
                날짜마다 그날을 구금 시작일로 넣었을 때 {baseLabel} {form.baseDate}까지의
                미결구금일수입니다.
              </p>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <MonthGrid
                testIdPrefix="detention-cell"
                cells={rows.map((r) => ({ date: r.startDate, content: r.days }))}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
