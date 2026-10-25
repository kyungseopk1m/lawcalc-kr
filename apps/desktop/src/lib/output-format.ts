import { formatCourtDate } from "@lawcalc-kr/core-engine";

/**
 * 결과 날짜 표기. `iso` = "2026-10-25" (기본, 종전 출력 그대로),
 * `court` = 법원식 "2026. 10. 25.(일)".
 */
export type DateStyle = "iso" | "court";

const DATE_STYLE_KEY = "lawcalc-kr.dateStyle";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function readDateStyle(): DateStyle {
  if (typeof window === "undefined") return "iso";
  return window.localStorage.getItem(DATE_STYLE_KEY) === "court" ? "court" : "iso";
}

export function writeDateStyle(style: DateStyle): void {
  window.localStorage.setItem(DATE_STYLE_KEY, style);
}

/** "2026-10-25" → "2026. 10. 25.(일)". 달력에 없는 날짜면 `null`. */
export function formatCourtDateWithWeekday(iso: string): string | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${formatCourtDate(iso)}(${WEEKDAYS[date.getUTCDay()]})`;
}

// 독립된 YYYY-MM-DD 만 바꾼다. "v2024-01-01" 같은 식별자나 "2026-10-25T09:00" 같은 시각은 그대로 둔다.
const ISO_DATE = /(?<![\w/@:-])\d{4}-\d{2}-\d{2}(?![\w:-])/g;

/** 문자열 안의 ISO 날짜를 고른 표기로 바꾼다. `iso` 면 입력을 그대로 돌려준다. */
export function applyDateStyle(text: string, style: DateStyle): string {
  if (style === "iso") return text;
  return text.replace(ISO_DATE, (iso) => formatCourtDateWithWeekday(iso) ?? iso);
}

/** 버전·시각 필드는 표기 대상이 아니다. */
const UNSTYLED_KEYS = new Set(["dataVersion", "dataVersions", "computedAt", "createdAt"]);

/** 내보내기 view 의 모든 문자열에 날짜 표기를 적용한 사본. `iso` 면 원본을 그대로 돌려준다. */
export function applyDateStyleDeep<T>(value: T, style: DateStyle): T {
  if (style === "iso") return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return applyDateStyle(v, style);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v).map(([k, child]) => [k, UNSTYLED_KEYS.has(k) ? child : walk(child)]),
      );
    }
    return v;
  };
  return walk(value) as T;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 클립보드 텍스트의 HTML 판. 탭으로 나뉜 줄이 이어지면 표 하나(첫 줄은 머리행),
 * 나머지 줄은 문단이다. 한글·Word 에 붙이면 표가 유지된다.
 */
export function clipboardTextToHtml(text: string): string {
  const parts: string[] = [];
  let rows: string[][] = [];
  const flush = () => {
    if (rows.length === 0) return;
    const cols = Math.max(...rows.map((r) => r.length));
    const body = rows
      .map((row, i) => {
        const tag = i === 0 ? "th" : "td";
        const cells = Array.from({ length: cols }, (_, c) => escapeHtml(row[c] ?? ""));
        return `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
      })
      .join("");
    parts.push(`<table border="1" cellspacing="0" cellpadding="4">${body}</table>`);
    rows = [];
  };
  for (const line of text.split("\n")) {
    if (line.includes("\t")) {
      rows.push(line.split("\t"));
    } else {
      flush();
      parts.push(line === "" ? "<br>" : `<p>${escapeHtml(line)}</p>`);
    }
  }
  flush();
  return parts.join("");
}
