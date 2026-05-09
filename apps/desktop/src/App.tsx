import { Calculator, FileJson, TableProperties } from "lucide-react";
import { useMemo, useState } from "react";

import {
  calculateInterest,
  type CalcOptions,
  type InterestInput,
  type InterestResult,
  type LegalRatePreset as LegalRatePresetValue,
  type RateSegment,
} from "@lawcalc-kr/core-engine";

import { DisclaimerBar } from "./components/layout/DisclaimerBar";
import { Footer } from "./components/layout/Footer";
import { Header } from "./components/layout/Header";
import { DateRangeInput } from "./components/form/DateRangeInput";
import {
  LegalRatePreset,
  type LegalRatePresetOption,
  legalRateOptions,
} from "./components/form/LegalRatePreset";
import { OptionsPanel } from "./components/form/OptionsPanel";
import { PrincipalInput } from "./components/form/PrincipalInput";
import { RateSegmentInput } from "./components/form/RateSegmentInput";
import { LegalCitation } from "./components/result/LegalCitation";
import { SegmentTable } from "./components/result/SegmentTable";
import { SummaryCard } from "./components/result/SummaryCard";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";

const defaultOptions: CalcOptions = {
  mode: "period",
  leapYear: "fixed365",
  includeFirstDay: false,
};

const defaultInput: InterestInput = {
  principal: 10_000_000,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  legalRatePreset: "civil",
  options: defaultOptions,
  note: "",
};

function toLegalRatePreset(
  preset: LegalRatePresetOption,
  customRate: number,
): LegalRatePresetValue {
  return preset === "custom" ? { customRate: customRate > 0 ? customRate : 0.05 } : preset;
}

function validateInput(input: InterestInput, preset: LegalRatePresetOption, customRate: number) {
  const segmentError = input.segments?.some(
    (segment) => segment.from.length === 0 || segment.to.length === 0 || segment.rate <= 0,
  )
    ? "이자율 구간의 시작일, 종료일, 연이율을 모두 입력해 주세요."
    : "";

  return {
    principal: input.principal > 0 ? "" : "원금은 0보다 큰 정수여야 합니다.",
    dateRange:
      input.startDate.length > 0 && input.endDate.length > 0 && input.endDate >= input.startDate
        ? ""
        : "종료일은 시작일과 같거나 이후여야 합니다.",
    customRate: preset === "custom" && customRate <= 0 ? "직접 입력 이율은 0보다 커야 합니다." : "",
    segments: segmentError,
  };
}

export function App() {
  const [principal, setPrincipal] = useState(defaultInput.principal);
  const [startDate, setStartDate] = useState(defaultInput.startDate);
  const [endDate, setEndDate] = useState(defaultInput.endDate);
  const [segments, setSegments] = useState<RateSegment[]>([]);
  const [options, setOptions] = useState<CalcOptions>(defaultOptions);
  const [preset, setPreset] = useState<LegalRatePresetOption>("civil");
  const [customRate, setCustomRate] = useState(0.05);
  const [note, setNote] = useState("");

  const input = useMemo<InterestInput>(
    () => ({
      principal,
      startDate,
      endDate,
      ...(segments.length > 0 ? { segments } : {}),
      legalRatePreset: toLegalRatePreset(preset, customRate),
      options,
      note,
    }),
    [customRate, endDate, note, options, preset, principal, segments, startDate],
  );
  const errors = validateInput(input, preset, customRate);
  const [calculationError, setCalculationError] = useState("");
  const [result, setResult] = useState<InterestResult>(() => calculateInterest(defaultInput));

  const handleCalculate = () => {
    if (errors.principal || errors.dateRange || errors.customRate || errors.segments) {
      return;
    }

    try {
      setResult(calculateInterest(input));
      setCalculationError("");
    } catch (error) {
      setCalculationError(
        error instanceof Error ? error.message : "계산 중 알 수 없는 오류가 발생했습니다.",
      );
    }
  };

  const handleReset = () => {
    setPrincipal(defaultInput.principal);
    setStartDate(defaultInput.startDate);
    setEndDate(defaultInput.endDate);
    setSegments([]);
    setOptions(defaultOptions);
    setPreset("civil");
    setCustomRate(0.05);
    setNote("");
    setCalculationError("");
    setResult(calculateInterest(defaultInput));
  };

  const fallbackLabel = legalRateOptions[preset].label;

  return (
    <div className="flex min-h-screen flex-col bg-muted/30 text-foreground">
      <Header />
      <DisclaimerBar />

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,440px)_1fr]">
        <section className="space-y-4" aria-labelledby="input-title">
          <Card>
            <CardHeader>
              <CardTitle id="input-title" className="flex items-center gap-2">
                <Calculator className="h-4 w-4" aria-hidden="true" />
                이자 계산 입력
              </CardTitle>
              <CardDescription>
                원금, 계산 기간, 이율 구간과 산정 옵션을 입력합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <PrincipalInput value={principal} error={errors.principal} onChange={setPrincipal} />
              <DateRangeInput
                startDate={startDate}
                endDate={endDate}
                error={errors.dateRange}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
              <LegalRatePreset
                value={preset}
                customRate={customRate}
                error={errors.customRate}
                onValueChange={setPreset}
                onCustomRateChange={setCustomRate}
              />
              <RateSegmentInput
                fallbackLabel={fallbackLabel}
                value={segments}
                error={errors.segments}
                onChange={setSegments}
              />
              <OptionsPanel value={options} onChange={setOptions} />
              <label className="grid gap-2 text-sm font-medium">
                비고
                <textarea
                  className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="예: 1심 판결 선고일부터 완제일까지"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={handleCalculate}>
                  계산
                </Button>
                <Button type="button" variant="outline" onClick={handleReset}>
                  초기화
                </Button>
              </div>
              {calculationError ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {calculationError}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4" aria-labelledby="result-title">
          <SummaryCard result={result} />

          <Card>
            <CardHeader>
              <CardTitle id="result-title" className="flex items-center gap-2">
                <TableProperties className="h-4 w-4" aria-hidden="true" />
                결과 표
              </CardTitle>
              <CardDescription>
                구간별 시작일, 종료일, 일수, 이율, 공식, 이자와 합계 행을 표시합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SegmentTable result={result} />
              <LegalCitation dataVersion={result.dataVersion} preset={preset} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileJson className="h-4 w-4" aria-hidden="true" />
                내보내기
              </CardTitle>
              <CardDescription>
                PDF, CSV, 클립보드, .lcalc 저장/로드 액션은 C 세션 IPC와 연결됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled>
                PDF
              </Button>
              <Button type="button" variant="secondary" disabled>
                CSV
              </Button>
              <Button type="button" variant="outline" disabled>
                복사
              </Button>
              <Button type="button" variant="outline" disabled>
                .lcalc
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <Footer />
    </div>
  );
}
