import { AlertTriangle } from "lucide-react";

export function DisclaimerBar() {
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-950">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 text-sm leading-6 sm:items-center sm:px-6">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" aria-hidden="true" />
        <p>
          이 도구의 계산 결과는 검토용 계산이며, 사건별 특수성은 전문가 확인 필요합니다.
          lawcalc-kr는 법원 공식 프로그램과 무관합니다.
        </p>
      </div>
    </div>
  );
}
