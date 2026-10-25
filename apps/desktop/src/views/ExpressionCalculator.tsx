import { CheckCircle2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import {
  STANDARD_DISCLAIMER,
  evaluateExpression,
  type CalculatorDigits,
  type CalculatorOptions,
  type CalculatorResult,
  type CalculatorRounding,
} from "@lawcalc-kr/core-engine";

import { Button } from "../components/ui/button";
import { CopyButton } from "../components/ui/copy-button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { useFormShortcuts } from "../hooks/use-form-shortcuts";

const DIGIT_OPTIONS: ReadonlyArray<CalculatorDigits> = [0, 1, 2, 3, 4, 5, "full"];

const ROUNDING_LABEL: Record<CalculatorRounding, string> = {
  floor: "절사 (내림)",
  round: "반올림 (사사오입)",
  ceil: "절상 (올림)",
};

export interface ExpressionFormState extends CalculatorOptions {
  expr: string;
}

export function emptyExpressionForm(): ExpressionFormState {
  return { expr: "", digits: 0, rounding: "floor" };
}

function digitsLabel(digits: CalculatorDigits): string {
  return digits === "full" ? "전체 (소수 10자리까지)" : `소수 ${digits}자리`;
}

export function formatExpressionForClipboard(
  form: ExpressionFormState,
  result: CalculatorResult,
): string {
  return [
    "LawCalc Korea 계산기 결과",
    `계산식: ${result.normalizedExpr}`,
    `답: ${result.display}${result.moreDigits ? " (이하 생략)" : ""}`,
    form.digits === "full"
      ? `자릿수: ${digitsLabel(form.digits)}`
      : `자릿수·끝수: ${digitsLabel(form.digits)}, ${ROUNDING_LABEL[form.rounding]}`,
    "",
    STANDARD_DISCLAIMER,
  ].join("\n");
}

function compute(form: ExpressionFormState) {
  if (form.expr.trim() === "") return { result: null, error: null };
  try {
    return { result: evaluateExpression(form.expr, form), error: null };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export function ExpressionCalculator({ active = true }: { active?: boolean }) {
  const [form, setForm] = useState<ExpressionFormState>(emptyExpressionForm);

  const { result, error } = useMemo(() => compute(form), [form]);

  const update = (patch: Partial<ExpressionFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleReset = () => {
    setForm(emptyExpressionForm());
  };

  useFormShortcuts({ onReset: handleReset, enabled: active });

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[580px_minmax(0,1fr)]">
      <div className="grid content-start gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">계산식 입력</CardTitle>
            <p className="text-xs text-muted-foreground">
              + − × ÷ 와 괄호 ( ) [ ] {"{ }"} 를 씁니다. *·x 는 곱하기, / 는 나누기로 읽고, 숫자의
              쉼표와 "원" 같은 한글 단위는 무시합니다. 부동소수점 없이 분수로 정확히 계산한 뒤 정한
              자릿수에서 한 번만 끝수를 처리합니다.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <label className="grid gap-2 text-sm font-medium">
              계산식
              <Input
                value={form.expr}
                placeholder="예: 1,000 × 1.15 / 7"
                onChange={(e) => update({ expr: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-2 text-sm font-medium">
                자릿수
                <Select
                  value={String(form.digits)}
                  onChange={(e) =>
                    update({
                      digits:
                        e.target.value === "full"
                          ? "full"
                          : (Number(e.target.value) as CalculatorDigits),
                    })
                  }
                >
                  {DIGIT_OPTIONS.map((d) => (
                    <option key={d} value={String(d)}>
                      {digitsLabel(d)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                끝수 처리
                <Select
                  value={form.rounding}
                  disabled={form.digits === "full"}
                  onChange={(e) => update({ rounding: e.target.value as CalculatorRounding })}
                >
                  {(Object.keys(ROUNDING_LABEL) as CalculatorRounding[]).map((r) => (
                    <option key={r} value={r}>
                      {ROUNDING_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              음수의 절사·절상은 수직선 방향입니다 (-1.234를 2자리 절사하면 -1.24, 절상하면 -1.23).
              반올림은 0에서 먼 쪽으로 올립니다.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleReset} variant="outline" type="button">
                초기화
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-4">
        {error ? (
          <div
            className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
            role="alert"
          >
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {result ? (
          <>
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">계산 결과</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 pt-0">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">계산식</span>
                  <span className="text-right" data-testid="calculator-expr">
                    {result.normalizedExpr}
                  </span>
                  <span className="text-muted-foreground">답</span>
                  <span
                    className="text-right text-base font-semibold"
                    data-testid="calculator-value"
                  >
                    {result.display}
                  </span>
                </div>
                {result.moreDigits ? (
                  <span className="text-xs text-muted-foreground">
                    소수 10자리 뒤에도 0이 아닌 자리가 남아 잘라서 보였습니다.
                  </span>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton
                    key={JSON.stringify(form)}
                    getText={() => formatExpressionForClipboard(form, result)}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{STANDARD_DISCLAIMER}</span>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
