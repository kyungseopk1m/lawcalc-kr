/**
 * 호봉승급 일정 · 일실수입 표 행 단위 편집 카드. 부상·사망 공용.
 * 상태 변환은 `lib/compensation-extras.ts` 에 있다.
 */

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { shiftMonths, type CompensationSegment } from "@lawcalc-kr/compensation";
import { isValidIsoDate } from "@lawcalc-kr/core-engine";

import {
  emptyIncomeStep,
  emptyManualIncomeRow,
  LOSS_RATE_PERCENT_FORMAT,
  manualRowsFromSegments,
  WAGE_SCHEDULE_MODE_LABELS,
  type IncomeStepRow,
  type ManualIncomeRow,
  type WageScheduleFormState,
  type WageScheduleMode,
} from "../lib/compensation-extras";
import { formatWonInput, parseWonText } from "../lib/format-won";
import { FieldError, parseNumberText } from "../lib/parse-number";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { HelpText } from "./form/HelpText";

export function WageScheduleCard({
  value,
  onChange,
  mode,
  accidentDate,
  segments,
}: {
  value: WageScheduleFormState;
  onChange: (value: WageScheduleFormState) => void;
  mode: "injury" | "death";
  accidentDate: string;
  /** 마지막 계산 결과 구간. 직접 편집 표를 이 값으로 채울 수 있다. */
  segments: readonly CompensationSegment[] | undefined;
}) {
  const patch = (next: Partial<WageScheduleFormState>) => onChange({ ...value, ...next });
  const [intervalText, setIntervalText] = useState("12");
  const setStep = (uid: string, next: Partial<IncomeStepRow>) =>
    patch({ steps: value.steps.map((r) => (r.uid === uid ? { ...r, ...next } : r)) });
  const setRow = (uid: string, next: Partial<ManualIncomeRow>) =>
    patch({ rows: value.rows.map((r) => (r.uid === uid ? { ...r, ...next } : r)) });

  const addStep = () => {
    const last = value.steps.at(-1);
    const interval = parseNumberText(intervalText, { integer: true, min: 1, max: 600 }).value;
    const fromDate =
      last === undefined
        ? accidentDate
        : isValidIsoDate(last.fromDate) && interval !== undefined
          ? shiftMonths(last.fromDate, interval)
          : "";
    patch({ steps: [...value.steps, emptyIncomeStep(fromDate, last?.monthlyText ?? "")] });
  };
  const addRow = () => {
    const last = value.rows.at(-1);
    const start = last === undefined ? 0 : Number(last.endMonthText) || 0;
    patch({
      rows: [
        ...value.rows,
        emptyManualIncomeRow(
          start,
          last?.lossPercentText ?? (mode === "death" ? "100" : ""),
          last?.livingCost ?? mode === "death",
        ),
      ],
    });
  };

  return (
    <Card data-testid="compensation-wage-schedule-card">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">호봉승급 · 일실수입 표 편집 (선택)</CardTitle>
        <HelpText cite="대법원 88다카6761 전원합의체">
          장차 임금이 오를 것을 상당한 정도로 확실하게 예측할 수 있는 객관적 자료(보수규정·호봉표
          등)가 있으면 승급 후 소득도 일실수입에 반영합니다 (대법원 1989. 12. 26. 선고 88다카6761
          전원합의체). 승급일마다 구간을 나누고 구간 계수는 H(끝) - H(시작)입니다. 표 직접 편집은
          자동 구간 대신 입력한 행으로 계산합니다.
        </HelpText>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-0">
        <label className="grid gap-2 text-sm font-medium">
          월소득 계산 방식
          <Select
            aria-label="월소득 계산 방식"
            value={value.mode}
            onChange={(e) => patch({ mode: e.target.value as WageScheduleMode })}
          >
            {Object.entries(WAGE_SCHEDULE_MODE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </label>

        {value.mode === "steps" ? (
          <div className="grid gap-2">
            <HelpText>
              첫 행이 사고일과 같은 달이면 직종·일당 입력 없이 계산합니다. 첫 승급 전은 직종
              단가·일당을 씁니다. 첫 승급 이후에는 노임단가 변경일을 경계로 쓰지 않으므로, 정년 뒤
              도시일용 노임으로 돌아가는 사건은 일실수입 표 직접 편집으로 입력하세요.
            </HelpText>
            {value.steps.map((row, i) => (
              <div key={row.uid} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <label className="grid gap-1 text-xs">
                  {i + 1}. 적용 시작일
                  <Input
                    type="date"
                    aria-label={`승급 ${i + 1} 적용 시작일`}
                    value={row.fromDate}
                    onChange={(e) => setStep(row.uid, { fromDate: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  월소득 (원)
                  <Input
                    inputMode="numeric"
                    aria-label={`승급 ${i + 1} 월소득`}
                    value={formatWonInput(row.monthlyText)}
                    onChange={(e) =>
                      setStep(row.uid, { monthlyText: parseWonText(e.target.value) })
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`승급 ${i + 1} 삭제`}
                  onClick={() => patch({ steps: value.steps.filter((r) => r.uid !== row.uid) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs">
                승급 간격 (개월)
                <Input
                  inputMode="numeric"
                  aria-label="승급 간격"
                  className="w-24"
                  value={intervalText}
                  onChange={(e) => setIntervalText(e.target.value)}
                />
              </label>
              <Button type="button" variant="outline" onClick={addStep}>
                <Plus className="mr-1 h-4 w-4" />
                승급 추가
              </Button>
            </div>
          </div>
        ) : null}

        {value.mode === "manual" ? (
          <div className="grid gap-2">
            <p className="text-xs text-muted-foreground">
              월수는 사고일 기준입니다 (0 = 사고일). 행은 앞 행 끝 이상에서 시작해야 하고 240 한도는
              행 순서대로 누적합니다. 생계비 공제는{" "}
              {mode === "death" ? "생계비 비율만큼" : "1/3 (기대여명 이후 구간)"} 뺍니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={segments === undefined || segments.length === 0}
                onClick={() =>
                  patch({ rows: manualRowsFromSegments(segments ?? [], mode === "death") })
                }
              >
                마지막 계산 결과로 채우기
              </Button>
            </div>
            {value.rows.map((row, i) => (
              <div
                key={row.uid}
                className="grid grid-cols-[repeat(4,minmax(0,1fr))_auto_auto] items-end gap-2"
              >
                <label className="grid gap-1 text-xs">
                  {i + 1}. 시작 월
                  <Input
                    inputMode="numeric"
                    aria-label={`표 ${i + 1}행 시작 월수`}
                    value={row.startMonthText}
                    onChange={(e) => setRow(row.uid, { startMonthText: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  끝 월
                  <Input
                    inputMode="numeric"
                    aria-label={`표 ${i + 1}행 끝 월수`}
                    value={row.endMonthText}
                    onChange={(e) => setRow(row.uid, { endMonthText: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  월소득 (원)
                  <Input
                    inputMode="numeric"
                    aria-label={`표 ${i + 1}행 월소득`}
                    value={formatWonInput(row.monthlyText)}
                    onChange={(e) => setRow(row.uid, { monthlyText: parseWonText(e.target.value) })}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  상실률 (%)
                  <Input
                    inputMode="decimal"
                    aria-label={`표 ${i + 1}행 상실률`}
                    value={row.lossPercentText}
                    onChange={(e) => setRow(row.uid, { lossPercentText: e.target.value })}
                  />
                  <FieldError
                    message={parseNumberText(row.lossPercentText, LOSS_RATE_PERCENT_FORMAT).error}
                  />
                </label>
                <label className="flex items-center gap-1 pb-2 text-xs">
                  <input
                    type="checkbox"
                    aria-label={`표 ${i + 1}행 생계비 공제`}
                    checked={row.livingCost}
                    onChange={(e) => setRow(row.uid, { livingCost: e.target.checked })}
                  />
                  생계비
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`표 ${i + 1}행 삭제`}
                  onClick={() => patch({ rows: value.rows.filter((r) => r.uid !== row.uid) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div>
              <Button type="button" variant="outline" onClick={addRow}>
                <Plus className="mr-1 h-4 w-4" />행 추가
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
