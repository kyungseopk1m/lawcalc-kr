import { AlertTriangle } from "lucide-react";

export function DisclaimerBar() {
  return (
    <div role="note" aria-label="면책 고지" className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-2.5 text-sm leading-6 text-amber-900 sm:px-6">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <p>이 계산 결과는 검토 보조용이며 법률 자문이나 법원 공식 계산 결과를 대체하지 않습니다.</p>
      </div>
    </div>
  );
}
