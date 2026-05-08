import type { InterestResult } from "@lawcalc-kr/core-engine";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

interface SummaryCardProps {
  result: InterestResult;
}

const currencyFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
  style: "currency",
  currency: "KRW",
});

export function SummaryCard({ result }: SummaryCardProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm text-muted-foreground">원금</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 text-xl font-semibold">
          {currencyFormatter.format(result.principal)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm text-muted-foreground">이자 합계</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 text-xl font-semibold">
          {currencyFormatter.format(result.totalInterest)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm text-muted-foreground">원리금 합계</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 text-xl font-semibold">
          {currencyFormatter.format(result.grandTotal)}
        </CardContent>
      </Card>
    </div>
  );
}
