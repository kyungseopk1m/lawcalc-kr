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
  const digits = text.replaceAll(",", "").replace(/[^\d]/g, "");
  if (digits.length === 0) return "";
  return wonFormatter.format(Number(digits));
}

export function parseWonText(text: string): string {
  return text.replaceAll(",", "").replace(/[^\d]/g, "");
}

export function parseWonAmount(text: string, fallback = 0): number {
  const digits = parseWonText(text);
  return digits.length > 0 ? Number(digits) : fallback;
}
