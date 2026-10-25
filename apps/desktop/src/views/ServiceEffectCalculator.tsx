import { useMemo, useState, type ReactNode } from "react";

import {
  STANDARD_DISCLAIMER,
  buildServiceEffectCalendar,
  computeServiceEffect,
  createHolidayDeps,
  holidaysVersionTag,
  loadHolidays,
  type HolidayExtensionStatus,
  type ServiceEffectInput,
  type ServiceEffectResult,
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
import { HelpText } from "../components/form/HelpText";

const HOLIDAY_DATASET = loadHolidays();
const HOLIDAYS_VERSION_TAG = holidaysVersionTag(HOLIDAY_DATASET);
const holidayDeps = createHolidayDeps(HOLIDAY_DATASET);

/** 화면의 "구하는 날". 엔진 입력의 kind · variant · basis · days 조합을 하나로 고른다. */
export type ServiceEffectChoice =
  | "public14"
  | "public15"
  | "publicSubsequent"
  | "publicForeign"
  | "appeal14"
  | "appeal7"
  | "final14"
  | "final7";

const CHOICES: ReadonlyArray<{
  value: ServiceEffectChoice;
  label: string;
  options: Omit<ServiceEffectInput, "serviceDate">;
}> = [
  {
    value: "public14",
    label: "공시송달 효력발생일 (첫 공시송달, 2주 기간이 지난 다음 날)",
    options: { kind: "publicServiceEffect", variant: "first", basis: "day14" },
  },
  {
    value: "public15",
    label: "공시송달 효력발생일 (첫 공시송달, 실시일 + 15일 표기)",
    options: { kind: "publicServiceEffect", variant: "first", basis: "day15" },
  },
  {
    value: "publicSubsequent",
    label: "공시송달 효력발생일 (같은 당사자에게 하는 그 뒤의 공시송달)",
    options: { kind: "publicServiceEffect", variant: "subsequent" },
  },
  {
    value: "publicForeign",
    label: "공시송달 효력발생일 (외국에서 할 송달, 2월)",
    options: { kind: "publicServiceEffect", variant: "foreign" },
  },
  {
    value: "appeal14",
    label: "상소기간 만료일 (항소·상고 2주)",
    options: { kind: "appealExpiry", days: 14 },
  },
  {
    value: "appeal7",
    label: "상소기간 만료일 (즉시항고 1주)",
    options: { kind: "appealExpiry", days: 7 },
  },
  {
    value: "final14",
    label: "재판 확정일 (항소·상고 2주)",
    options: { kind: "finalDate", days: 14 },
  },
  {
    value: "final7",
    label: "재판 확정일 (즉시항고 1주)",
    options: { kind: "finalDate", days: 7 },
  },
];

const RESULT_LABEL: Record<ServiceEffectInput["kind"], string> = {
  publicServiceEffect: "효력발생일",
  appealExpiry: "상소기간 만료일",
  finalDate: "재판 확정일",
};

const EXTENSION_LABEL: Record<HolidayExtensionStatus, string> = {
  off: "해당 없음",
  notApplied: "연장 없음 (말일이 근무일)",
  applied: "토요일·공휴일이라 뒤로 밀림",
  outOfCoverage: "판정하지 못했습니다 (공휴일 데이터 커버리지 밖 또는 2008-03-22 이전 토요일)",
};

export interface ServiceEffectFormState {
  serviceDate: string;
  choice: ServiceEffectChoice;
  pendingOn20080322: boolean;
}

export function emptyServiceEffectForm(): ServiceEffectFormState {
  return { serviceDate: todayIso(), choice: "public14", pendingOn20080322: false };
}

export function buildServiceEffectInput(form: ServiceEffectFormState): ServiceEffectInput {
  const choice = CHOICES.find((c) => c.value === form.choice) ?? CHOICES[0]!;
  return {
    ...choice.options,
    serviceDate: form.serviceDate,
    ...(form.pendingOn20080322 ? { pendingOn20080322: true } : {}),
  };
}

export function formatServiceEffectForClipboard(
  input: ServiceEffectInput,
  result: ServiceEffectResult,
): string {
  const lines = [
    "LawCalc Korea 송달 효력·상소기간 계산 결과",
    `송달일 (공시송달은 실시일): ${result.serviceDate}`,
    `${RESULT_LABEL[input.kind]}: ${result.date}`,
  ];
  if (result.periodEnd) lines.push(`기간 만료일: ${result.periodEnd}`);
  lines.push(`토요일·공휴일: ${EXTENSION_LABEL[result.holidayExtension]}`);
  if (result.reasonKo) lines.push(`사유: ${result.reasonKo}`);
  if (result.noteKo) lines.push(`참고: ${result.noteKo}`);
  lines.push(
    `적용 조문: ${result.articles.join(", ")}`,
    `산출 근거: ${result.formulaText}`,
    `공휴일 데이터 버전: ${HOLIDAYS_VERSION_TAG}`,
    "",
    STANDARD_DISCLAIMER,
  );
  return lines.join("\n");
}

function compute(input: ServiceEffectInput) {
  try {
    const result = computeServiceEffect(input, holidayDeps);
    const { serviceDate, ...options } = input;
    const [y, m] = serviceDate.split("-").map(Number) as [number, number];
    const calendar = buildServiceEffectCalendar(y, m, options, holidayDeps);
    return { result, calendar, error: null };
  } catch (e) {
    return { result: null, calendar: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** `2026-09-16` → `9.16`. */
function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}.${d}`;
}

export interface MonthGridCell {
  date: string;
  content: ReactNode;
  title?: string;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 날짜순으로 이어진 칸을 달마다 7열 달력으로 그린다. 미결구금 탭도 같은 모양을 쓴다. */
export function MonthGrid({
  cells,
  testIdPrefix,
}: {
  cells: MonthGridCell[];
  testIdPrefix: string;
}) {
  const months = new Map<string, MonthGridCell[]>();
  for (const cell of cells) {
    const key = cell.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), cell]);
  }
  return (
    <div className="grid gap-4">
      {[...months].map(([key, monthCells]) => {
        const [y, m] = key.split("-").map(Number);
        const offset = new Date(`${monthCells[0]!.date}T00:00:00Z`).getUTCDay();
        return (
          <section key={key} aria-label={`${y}년 ${m}월`}>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">
              {y}년 {m}월
            </h3>
            <div className="grid grid-cols-7 gap-px text-center text-xs">
              {WEEKDAYS.map((w) => (
                <span key={w} className="py-0.5 text-muted-foreground">
                  {w}
                </span>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <span key={`blank-${i}`} />
              ))}
              {monthCells.map((cell) => (
                <span
                  key={cell.date}
                  className="rounded border border-border px-0.5 py-1"
                  title={cell.title}
                  data-testid={`${testIdPrefix}-${cell.date}`}
                >
                  <span className="block text-muted-foreground">{Number(cell.date.slice(8))}</span>
                  <span className="block">{cell.content}</span>
                </span>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ServiceEffectCalculator({ active = true }: { active?: boolean }) {
  const [form, setForm] = useState<ServiceEffectFormState>(emptyServiceEffectForm);

  const input = useMemo(() => buildServiceEffectInput(form), [form]);
  const { result, calendar, error } = useMemo(() => compute(input), [input]);

  const update = (patch: Partial<ServiceEffectFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleReset = () => {
    setForm(emptyServiceEffectForm());
  };

  useFormShortcuts({ onReset: handleReset, enabled: active });

  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 content-start items-start gap-4 px-4 py-4 sm:px-6 md:grid-cols-2 lg:grid-cols-[520px_minmax(0,1fr)]">
      <div className="grid content-start gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">송달 효력·상소기간 입력</CardTitle>
            <p className="text-xs text-muted-foreground">
              민사소송법 제196조 (공시송달의 효력발생) / 제396조 제1항 (항소기간) / 제444조 제1항
              (즉시항고) / 제498조 (판결의 확정시기). 기간은 제170조에 따라 민법 제157조·제160조·
              제161조로 계산합니다.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-0">
            <label className="grid gap-2 text-sm font-medium">
              구하는 날
              <Select
                value={form.choice}
                onChange={(e) => update({ choice: e.target.value as ServiceEffectChoice })}
              >
                {CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              송달일 (공시송달은 실시일)
              <Input
                type="date"
                value={form.serviceDate}
                onChange={(e) => update({ serviceDate: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.pendingOn20080322}
                onChange={(e) => update({ pendingOn20080322: e.target.checked })}
              />
              2008-03-22 당시 법원에 계속 중인 사건
            </label>
            <HelpText cite="민법 부칙(법률 제8720호) 제3조 제1항">
              민법 부칙(법률 제8720호) 제3조 제1항에 따라 이 사건에는 토요일 포함 개정 제161조를
              적용하지 않아, 말일이 토요일이어도 연장하지 않습니다. 공휴일 데이터 커버리지:{" "}
              {HOLIDAY_DATASET.coverage.from} ~ {HOLIDAY_DATASET.coverage.to} (버전{" "}
              {HOLIDAYS_VERSION_TAG}).
            </HelpText>
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
                  <span className="text-muted-foreground">{RESULT_LABEL[input.kind]}</span>
                  <span
                    className="text-right text-base font-semibold"
                    data-testid="service-effect-date"
                  >
                    {result.date}
                  </span>
                  {result.periodEnd ? (
                    <>
                      <span className="text-muted-foreground">기간 만료일</span>
                      <span className="text-right">{result.periodEnd}</span>
                    </>
                  ) : null}
                  <span className="text-muted-foreground">토요일·공휴일</span>
                  <span className="text-right" data-testid="service-effect-extension">
                    {EXTENSION_LABEL[result.holidayExtension]}
                  </span>
                </div>
                {result.reasonKo || result.noteKo ? (
                  <Notice
                    tone={result.holidayExtension === "outOfCoverage" ? "warn" : "info"}
                    testId="service-effect-reason"
                  >
                    <span>{[result.reasonKo, result.noteKo].filter(Boolean).join(" ")}</span>
                  </Notice>
                ) : null}
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
                    getText={() => formatServiceEffectForClipboard(input, result)}
                  />
                </div>
              </CardContent>
            </Card>

            <Notice tone="info">
              <span>{STANDARD_DISCLAIMER}</span>
            </Notice>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">석 달 달력</CardTitle>
                <p className="text-xs text-muted-foreground">
                  날짜마다 그날을 송달일로 넣은 {RESULT_LABEL[input.kind]}입니다. 대괄호 [ ] 는
                  토요일·공휴일 때문에 뒤로 밀린 날, 물음표 ? 는 토요일·공휴일 여부를 판정하지 못한
                  날입니다.
                </p>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <MonthGrid
                  testIdPrefix="service-effect-cell"
                  cells={calendar.map((r) => ({
                    date: r.serviceDate,
                    title: r.formulaText,
                    content: r.pushed
                      ? `[${shortDate(r.date)}]`
                      : r.holidayExtension === "outOfCoverage"
                        ? `${shortDate(r.date)}?`
                        : shortDate(r.date),
                  }))}
                />
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </main>
  );
}
