import { computeStampDuty, type StampDutyInput } from "@lawcalc-kr/core-engine";
import { useMemo } from "react";

import { formatWon } from "../lib/format-won";

/**
 * 인지 환급액·소장 보정액 보조 패널.
 *
 * - 소장·항소장·상고장: 환급 청구 가능액 (민사소송 등 인지법 제14조 제1항).
 * - 지급명령·화해·조정신청: 소송으로 옮겨 갈 때 보정할 인지액 (인지법 제7조 제3항,
 *   민사조정법 제36조 제2항).
 *
 * 어느 쪽인지는 엔진이 사건구분으로 가른다. 본 계산기의 인지 입력을 그대로 쓰며 .lcalc 에
 * 저장하지 않는다.
 */
export function StampExtrasPanel({ stampDuty }: { stampDuty: StampDutyInput }) {
  const view = useMemo(() => {
    try {
      const { refund } = computeStampDuty({ ...stampDuty, includeRefund: true });
      if (refund) {
        return {
          title: "인지 환급액 (인지법 제14조 제1항)",
          note: "제14조 제1항 각 호가 정하는 사유가 있을 때 청구할 수 있는 금액입니다. 인지액의 2분의 1이고, 그 2분의 1이 10만원 미만이면 인지액에서 10만원을 뺀 금액입니다.",
          label: "환급 청구 가능액",
          ...refund,
        };
      }
    } catch {
      // 환급 대상이 아닌 신청서면 보정액 쪽으로 넘어간다.
    }
    try {
      const { lawsuitTopUp } = computeStampDuty({ ...stampDuty, includeLawsuitTopUp: true });
      if (lawsuitTopUp) {
        return {
          title: "소장 보정 인지액 (본안 이행 시)",
          note: "이의신청 등으로 소가 제기된 것으로 보는 경우, 같은 소가의 1심 소장 인지액에서 신청서에 붙인 인지액을 뺀 금액을 보정합니다.",
          label: "보정할 인지액",
          ...lawsuitTopUp,
        };
      }
    } catch {
      // 보전처분·항고, 또는 입력 오류. 본 계산기 결과 쪽에서 오류를 보여 준다.
    }
    return null;
  }, [stampDuty]);

  if (view === null) return null;

  return (
    <details className="border-t border-border pt-3">
      <summary className="cursor-pointer text-sm font-medium">{view.title}</summary>
      <div className="grid gap-2 pt-3">
        <p className="text-xs text-muted-foreground">{view.note}</p>
        <div className="grid gap-2 rounded-md bg-muted/60 p-3">
          <p className="text-sm">
            {view.label} <strong>{formatWon(view.amount)}</strong>
          </p>
          <p className="text-xs text-muted-foreground">{view.formulaText}</p>
        </div>
      </div>
    </details>
  );
}
