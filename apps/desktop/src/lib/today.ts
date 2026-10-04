/** 로컬 시간대 기준 오늘(YYYY-MM-DD). toISOString 은 UTC 라 KST 오전 0~9시에 전날이 나온다. */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
