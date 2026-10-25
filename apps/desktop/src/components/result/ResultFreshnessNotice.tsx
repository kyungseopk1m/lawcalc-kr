import { Notice } from "../ui/notice";

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
    <Notice tone="warn" testId="result-freshness-notice">
      {stale ? (
        <span>
          결과가 지금 입력과 맞지 않습니다. 다시 계산하세요. 그 전까지 내보내기와 저장은 막아
          둡니다.
        </span>
      ) : null}
      {notice ? <span>{notice}</span> : null}
    </Notice>
  );
}
