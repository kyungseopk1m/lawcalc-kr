import { AlertTriangle } from "lucide-react";

export function DisclaimerBar() {
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-950">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 text-sm leading-6 sm:items-center sm:px-6">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" aria-hidden="true" />
        <p>검토용 계산이며, 사건별 특수성은 전문가 확인 필요</p>
      </div>
    </div>
  );
}
