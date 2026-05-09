import type { InterestResult } from "@lawcalc-kr/core-engine";

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
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryValue label="원금" value={formatWon(result.principal)} />
          <SummaryValue label="이자 합계" value={formatWon(result.totalInterest)} />
          <SummaryValue label="원리금 합계" value={formatWon(result.grandTotal)} />
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

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
