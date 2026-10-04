import { useCallback, useState } from "react";

interface Entry<T> {
  value: T | null;
  /** 값을 넣은 직후 render 의 입력 지문. null 이면 다음 render 에서 채운다. */
  fingerprint: string | null;
  /** 현재 입력으로 다시 계산하지 못한 저장 결과. 입력과 맞는지 알 수 없다. */
  unverified: boolean;
  notice: string | null;
}

/**
 * 계산 결과(또는 오류 문구)를 그 결과를 낸 입력의 지문과 함께 들고 있는 state.
 *
 * 지문은 `createLcalcDirtySnapshot` 으로 만든 입력 문자열이다. 결과를 넣은 뒤 입력이
 * 바뀌면 `stale` 이 true 가 되어, 화면은 옛 결과를 내보내기·저장에 쓰지 않는다.
 * `.lcalc` 열기처럼 입력 setter 와 결과 setter 를 한 번에 부르는 경우에도 맞도록,
 * 지문은 `setValue` 호출 시점이 아니라 그 다음 render 의 입력에서 잡는다.
 */
export function useResultFingerprint<T>(fingerprint: string, initial?: () => T) {
  const [entry, setEntry] = useState<Entry<T>>(() => ({
    value: initial ? initial() : null,
    fingerprint,
    unverified: false,
    notice: null,
  }));

  if (entry.fingerprint === null) {
    setEntry({ ...entry, fingerprint });
  }

  const setValue = useCallback((value: T | null) => {
    setEntry({ value, fingerprint: null, unverified: false, notice: null });
  }, []);

  /**
   * `.lcalc` 열기: 저장된 입력을 현재 엔진으로 다시 계산해 보인다. `summarize` 로 뽑은
   * 핵심 값(최종액·만료일 등)이 저장 결과와 다르면 안내를 단다. 핵심 값은 같아도
   * `detail` 로 뽑은 세부 값(소계 등)이 다르면 세부 구성이 다르다고 알린다. 재계산이
   * 실패하면 저장 결과를 보이되 불일치(stale)로 둔다.
   *
   * 반환값: 저장 당시 결과와 다르거나 다시 계산하지 못했으면 true. 사건 파일 열기가
   * 토스트에 탭 이름을 덧붙이는 데 쓴다.
   */
  const setLoaded = useCallback(
    (
      saved: T | null | undefined,
      recompute: () => T,
      summarize: (value: T) => string,
      detail?: (value: T) => string,
    ): boolean => {
      let current: T;
      try {
        current = recompute();
      } catch (e) {
        if (!saved) throw e;
        setEntry({
          value: saved,
          fingerprint: null,
          unverified: true,
          notice: `현재 엔진으로 다시 계산하지 못해 저장 당시 결과를 표시합니다 (${
            e instanceof Error ? e.message : String(e)
          }).`,
        });
        return true;
      }
      let notice: string | null = null;
      if (saved) {
        const savedSummary = summarize(saved);
        const currentSummary = summarize(current);
        if (savedSummary !== currentSummary) {
          notice = `저장 당시 결과와 다릅니다 (저장 ${savedSummary} → 현재 ${currentSummary}). 현재 엔진으로 다시 계산한 값을 표시합니다.`;
        } else if (detail && detail(saved) !== detail(current)) {
          notice =
            "최종액은 저장 당시와 같지만 세부 항목 구성이 저장 당시와 다릅니다. 현재 엔진으로 다시 계산한 값을 표시합니다.";
        }
      }
      setEntry({ value: current, fingerprint: null, unverified: false, notice });
      return notice !== null;
    },
    [],
  );

  const stale =
    entry.value !== null &&
    (entry.unverified || (entry.fingerprint !== null && entry.fingerprint !== fingerprint));

  return { value: entry.value, setValue, setLoaded, stale, notice: entry.notice };
}
