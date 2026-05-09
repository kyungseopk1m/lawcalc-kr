import type { InterestResult, InterestSegment } from "@lawcalc-kr/core-engine";

import { FormulaCell } from "./FormulaCell";

interface SegmentTableProps {
  result: InterestResult;
}

const numberFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

function formatWon(value: number) {
  return `${numberFormatter.format(value)}원`;
}

function formatRate(rate: number) {
  return `${(rate * 100).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}%`;
}

export function SegmentTable({ result }: SegmentTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-3 py-3 font-medium">시작</th>
            <th className="px-3 py-3 font-medium">종료</th>
            <th className="px-3 py-3 text-right font-medium">일수</th>
            <th className="px-3 py-3 text-right font-medium">이율</th>
            <th className="px-3 py-3 font-medium">공식</th>
            <th className="px-3 py-3 text-right font-medium">이자</th>
          </tr>
        </thead>
        <tbody>
          {result.segments.map((segment) => (
            <SegmentRow key={`${segment.from}-${segment.to}`} segment={segment} />
          ))}
          <tr className="border-t border-border bg-muted/50 font-semibold">
            <td className="px-3 py-3" colSpan={5}>
              합계
            </td>
            <td className="px-3 py-3 text-right">{formatWon(result.totalInterest)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface SegmentRowProps {
  segment: InterestSegment;
}

function SegmentRow({ segment }: SegmentRowProps) {
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-3">{segment.from}</td>
      <td className="px-3 py-3">{segment.to}</td>
      <td className="px-3 py-3 text-right">{segment.days.toLocaleString("ko-KR")}일</td>
      <td className="px-3 py-3 text-right">{formatRate(segment.rate)}</td>
      <td className="px-3 py-3">
        <FormulaCell formula={segment.formula} />
      </td>
      <td className="px-3 py-3 text-right font-medium">{formatWon(segment.interest)}</td>
    </tr>
  );
}
