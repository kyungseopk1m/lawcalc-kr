import { AlertTriangle } from "lucide-react";

/**
 * 결과가 지금 입력과 맞지 않을 때(`stale`)와 `.lcalc` 열기에서 저장 결과와 재계산 결과가
 * 다를 때(`notice`) 결과 카드 위에 띄우는 안내. 둘 다 없으면 아무것도 그리지 않는다.
 */
export function ResultFreshnessNotice({
  stale,
  notice,
}: {
  stale: boolean;
  notice: string | null;
}) {
  if (!stale && !notice) return null;
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
      role="status"
      data-testid="result-freshness-notice"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="grid gap-1">
        {stale ? (
          <span>
            결과가 지금 입력과 맞지 않습니다. 다시 계산하세요. 그 전까지 내보내기와 저장은 막아
            둡니다.
          </span>
        ) : null}
        {notice ? <span>{notice}</span> : null}
      </span>
    </div>
  );
}
