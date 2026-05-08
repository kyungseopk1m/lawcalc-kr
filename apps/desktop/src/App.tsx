import { Calculator, FileJson, TableProperties } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  CalcOptions,
  InterestInput,
  InterestResult,
  LegalRatePreset as LegalRatePresetValue,
  RateSegment,
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

function resolvePresetRate(preset: LegalRatePresetOption, customRate: number) {
  return preset === "custom" ? customRate : legalRateOptions[preset].rate;
}

function countCalendarDays(startDate: string, endDate: string, includeFirstDay: boolean) {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return 0;
  }

  const inclusiveDays = Math.floor((end - start) / 86_400_000) + 1;
  return includeFirstDay ? inclusiveDays : Math.max(inclusiveDays - 1, 0);
}

function createMockResult(
  input: InterestInput,
  preset: LegalRatePresetOption,
  customRate: number,
): InterestResult {
  const fallbackRate = resolvePresetRate(preset, customRate);
  const sourceSegments =
    input.segments && input.segments.length > 0
      ? input.segments
      : [{ from: input.startDate, to: input.endDate, rate: fallbackRate }];

  const segments = sourceSegments.map((segment) => {
    const days = countCalendarDays(segment.from, segment.to, input.options.includeFirstDay);
    const denominator = input.options.leapYear === "actual" ? 366 : 365;
    const interest = Math.round((input.principal * segment.rate * days) / denominator);

    return {
      from: segment.from,
      to: segment.to,
      days,
      rate: segment.rate,
      formula: `${input.principal.toLocaleString("ko-KR")}원 × ${(segment.rate * 100).toLocaleString("ko-KR")}% × ${days.toLocaleString("ko-KR")}일 / ${denominator}`,
      interest,
    };
  });

  const totalInterest = segments.reduce((sum, segment) => sum + segment.interest, 0);

  return {
    principal: input.principal,
    segments,
    totalInterest,
    grandTotal: input.principal + totalInterest,
    options: input.options,
    dataVersion: "mock/w2",
    computedAt: new Date().toISOString(),
  };
}

function validateInput(input: InterestInput) {
  return {
    principal: input.principal > 0 ? "" : "원금은 0보다 큰 정수여야 합니다.",
    dateRange:
      input.startDate.length > 0 && input.endDate.length > 0 && input.endDate >= input.startDate
        ? ""
        : "종료일은 시작일과 같거나 이후여야 합니다.",
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
      segments,
      legalRatePreset: toLegalRatePreset(preset, customRate),
      options,
      note,
    }),
    [customRate, endDate, note, options, preset, principal, segments, startDate],
  );
  const errors = validateInput(input);
  const [result, setResult] = useState<InterestResult>(() =>
    createMockResult(defaultInput, "civil", 0.05),
  );

  const handleCalculate = () => {
    if (errors.principal || errors.dateRange) {
      return;
    }

    try {
      throw new Error("calculateInterest wire is scheduled for W3");
    } catch (error) {
      console.warn("W3 wire 예정", error);
      setResult(createMockResult(input, preset, customRate));
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
    setResult(createMockResult(defaultInput, "civil", 0.05));
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
                onValueChange={setPreset}
                onCustomRateChange={setCustomRate}
              />
              <RateSegmentInput
                fallbackLabel={fallbackLabel}
                value={segments}
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
