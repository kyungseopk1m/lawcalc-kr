const wonFormatter = new Intl.NumberFormat("ko-KR");

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
