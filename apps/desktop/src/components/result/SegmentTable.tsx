import type { InterestResult, InterestSegment } from "@lawcalc-kr/core-engine";

import { formatWon } from "../../lib/format-won";
import { FormulaCell } from "./FormulaCell";

interface SegmentTableProps {
  result: InterestResult;
}

function formatRate(rate: number) {
  return `${(rate * 100).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}%`;
}

export function SegmentTable({ result }: SegmentTableProps) {
  // 구 VK 이자 화면처럼 행마다 원금과 이자 누계를 보인다. 합계가 행 금액의 합이라 마지막 누계 = 합계.
  let cumulative = 0;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-2 py-3 font-medium">기간</th>
            <th className="px-2 py-3 text-right font-medium">일수</th>
            <th className="px-2 py-3 text-right font-medium">이율</th>
            <th className="px-2 py-3 text-right font-medium">원금</th>
            <th className="px-2 py-3 text-right font-medium">이자</th>
            <th className="px-2 py-3 text-right font-medium">이자 누계</th>
          </tr>
        </thead>
        <tbody>
          {result.segments.map((segment) => {
            cumulative += segment.interest;
            return (
              <SegmentRow
                key={`${segment.from}-${segment.to}`}
                segment={segment}
                principal={result.principal}
                cumulative={cumulative}
              />
            );
          })}
          <tr className="border-t border-amber-200 bg-amber-50 font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <td className="px-2 py-3" colSpan={4}>
              합계
            </td>
            <td className="whitespace-nowrap px-2 py-3 text-right text-amber-700 dark:text-amber-300">
              {formatWon(result.totalInterest)}
            </td>
            <td className="px-2 py-3" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface SegmentRowProps {
  segment: InterestSegment;
  principal: number;
  cumulative: number;
}

function SegmentRow({ segment, principal, cumulative }: SegmentRowProps) {
  // 공식은 긴 문자열이라 열로 두면 좁은 창에서 이자 열이 가로 스크롤 뒤로 밀린다. 행 아래에 펼친다.
  return (
    <>
      <tr className="border-t border-border">
        <td className="px-2 pt-3">
          {segment.from} ~ {segment.to}
        </td>
        <td className="px-2 pt-3 text-right">{segment.days.toLocaleString("ko-KR")}일</td>
        <td className="px-2 pt-3 text-right">{formatRate(segment.rate)}</td>
        <td className="whitespace-nowrap px-2 pt-3 text-right">{formatWon(principal)}</td>
        <td className="whitespace-nowrap px-2 pt-3 text-right font-medium">
          {formatWon(segment.interest)}
        </td>
        <td className="whitespace-nowrap px-2 pt-3 text-right">{formatWon(cumulative)}</td>
      </tr>
      <tr>
        <td className="px-2 pb-3 pt-1" colSpan={6}>
          <FormulaCell formula={segment.formula} />
        </td>
      </tr>
    </>
  );
}
