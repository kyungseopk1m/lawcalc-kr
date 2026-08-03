const wonFormatter = new Intl.NumberFormat("ko-KR");

const wonDisplayFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

/**
 * 금액을 "1,234원" 표기로 변환한다. 화면·결과 카드·클립보드 공통 단일 출처.
 * (이전엔 6개 파일에 동일 정의가 흩어져 있어 표기 변경 시 drift 위험이 있었다.)
 */
export function formatWon(value: number): string {
  return `${wonDisplayFormatter.format(value)}원`;
}

export function formatWonInput(text: string): string {
  const digits = parseWonText(text);
  if (digits.length === 0) return "";
  return wonFormatter.format(Number(digits));
}

export function parseWonText(text: string): string {
  // 소수점 이하는 버린다. 비-숫자를 그냥 지우면 소수점이 사라지면서 자릿수가 붙어
  // "30,000,000.00" 이 3,000,000,000 (100배) 이 된다. 원 단위 정수만 받는 입력이다.
  const integerPart = text.split(".")[0] ?? "";
  return integerPart.replaceAll(",", "").replace(/[^\d]/g, "");
}

export function parseWonAmount(text: string, fallback = 0): number {
  const digits = parseWonText(text);
  return digits.length > 0 ? Number(digits) : fallback;
}
