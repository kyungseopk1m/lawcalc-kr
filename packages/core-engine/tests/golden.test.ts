import { describe, expect, it } from "vitest";

/**
 * Placeholder until W2 collects court program outputs.
 *
 * W2에서 다음 절차로 골든 케이스 5+개를 수집한다:
 * 1. ~/Downloads/reference/CourtCalcExSetup.msi 를 Windows VM에서 실행, 또는
 *    http://ejpc.scourt.go.kr/ 의 손해배상 등 계산프로그램 웹 버전 사용
 * 2. 입력값과 결과 화면을 캡처해 tests/golden/case-XXX.json 으로 정규화 저장
 * 3. 본 파일을 fs.readdirSync 기반 표 테이블로 교체 (input → calculateInterest → expected 비교)
 *
 * 정책: 결과(input/output 숫자)만 비교, UI/리소스/내부 코드 참조 금지 (블랙박스).
 */
describe("golden cases (court program parity)", () => {
  it("placeholder until W2 collects court program outputs", () => {
    expect(true).toBe(true);
  });
});
