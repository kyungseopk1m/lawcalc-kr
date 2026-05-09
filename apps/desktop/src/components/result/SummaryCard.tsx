import type { InterestResult } from "@lawcalc-kr/core-engine";

import { cn } from "../../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

interface SummaryCardProps {
  result: InterestResult;
}

const numberFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

function formatWon(value: number) {
  return `${numberFormatter.format(value)}원`;
}

function formatComputedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function SummaryCard({ result }: SummaryCardProps) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm text-muted-foreground">요약</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 pt-0">
        <div className="grid gap-2">
          <SummaryValue label="원금" value={formatWon(result.principal)} />
          <SummaryValue label="이자 합계" value={formatWon(result.totalInterest)} />
          <SummaryValue label="원리금 합계" value={formatWon(result.grandTotal)} emphasis />
        </div>
        <dl className="grid gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="font-medium text-foreground">데이터 버전</dt>
            <dd>{result.dataVersion}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">계산 시각</dt>
            <dd>{formatComputedAt(result.computedAt)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function SummaryValue({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md px-3 py-2",
        emphasis && "bg-amber-50 ring-1 ring-amber-200",
      )}
    >
      <span
        className={cn("text-sm", emphasis ? "font-medium text-amber-900" : "text-muted-foreground")}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          emphasis ? "text-2xl tracking-tight text-amber-700" : "text-xl",
        )}
      >
        {value}
      </span>
    </div>
  );
}
