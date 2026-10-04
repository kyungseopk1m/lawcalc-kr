/**
 * 화면 숫자 칸 공용 파서.
 *
 * 화면마다 따로 만든 파서가 읽지 못한 값을 기본값(0·1·1/3)으로 바꾸거나 행을 버려서, "30%"
 * 를 넣은 과실비율이 0 으로 계산되는 식의 무음 오계산이 났다. 여기서는 읽지 못한 값을
 * 기본값으로 바꾸지 않고 오류 문구를 돌려준다. 빈칸만 "미입력"(`value` 없음)이다.
 *
 * 단위가 분명한 흔한 표기만 받는다: 비율 칸의 "30%", 인원 칸의 "10명" 처럼 라벨 단위와
 * 같은 꼬리말, 천 단위 쉼표. 라벨 단위와 어긋나 뜻이 갈리는 값(0~1 비율 칸의 "30")은 오류다.
 */

export interface ParsedNumber {
  /** 빈칸이면 없다. */
  value?: number;
  /** 읽지 못했거나 범위 밖이면 칸 옆에 보일 한국어 문구. */
  error?: string;
}

const PLAIN_NUMBER = /^(\d+\.?\d*|\.\d+)$/;
const FRACTION = /^(\d+)\/(\d+)$/;

function normalize(text: string): string {
  return text.replaceAll(",", "").replace(/\s+/g, "");
}

/**
 * 0~1 비율 칸. "0.3" 과 "30%" 를 0.3 으로, "1/3" 을 1 / 3 그대로 읽는다 (0.3333 으로 반올림하지 않는다).
 * % 없이 1 을 넘는 값("30")은 30% 인지 3000% 인지 단정할 수 없어 오류로 둔다.
 */
export function parseRatioText(text: string): ParsedNumber {
  const s = normalize(text);
  if (s.length === 0) return {};
  const fraction = FRACTION.exec(s);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return { error: "분모는 0보다 커야 합니다." };
    const value = Number(fraction[1]) / denominator;
    return value > 1 ? { error: "분수는 1 이하여야 합니다 (예: 1/3)." } : { value };
  }
  const percent = s.endsWith("%");
  const body = percent ? s.slice(0, -1) : s;
  if (!PLAIN_NUMBER.test(body)) {
    return { error: "숫자로 입력하세요 (예: 0.3, 30% 또는 1/3)." };
  }
  const value = percent ? Number(body) / 100 : Number(body);
  if (value > 1) {
    return {
      error: percent
        ? "0%~100% 사이여야 합니다."
        : "0~1 사이 소수로 입력하세요. 퍼센트라면 30% 처럼 % 를 붙이세요.",
    };
  }
  return { value };
}

/** 불러온 비율을 칸에 다시 쓸 문자열. 1/3 은 "0.3333333333333333" 대신 입력한 그대로 "1/3". */
export function formatRatioText(value: number): string {
  return value === 1 / 3 ? "1/3" : String(value);
}

export interface NumberTextOptions {
  /** 라벨 단위. 값 뒤에 붙어 오면 떼고 읽는다 (예: "명", "일"). */
  unit?: string;
  integer?: boolean;
  min?: number;
  max?: number;
}

/** 0 이상 수 칸 (인원·일수·연수 등). 범위는 `min`·`max` 로 좁힌다. */
export function parseNumberText(text: string, options: NumberTextOptions = {}): ParsedNumber {
  const { unit, integer = false, min, max } = options;
  let s = normalize(text);
  if (unit && s.endsWith(unit)) s = s.slice(0, -unit.length);
  if (s.length === 0) return text.trim().length === 0 ? {} : { error: "숫자를 입력하세요." };
  if (!PLAIN_NUMBER.test(s)) {
    return { error: unit ? `숫자로 입력하세요 (단위: ${unit}).` : "숫자로 입력하세요." };
  }
  const value = Number(s);
  if (integer && !Number.isInteger(value)) return { error: "정수로 입력하세요." };
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
    const u = unit ?? "";
    return {
      error:
        max !== undefined
          ? `${min ?? 0}~${max}${u} 사이여야 합니다.`
          : `${min}${u} 이상이어야 합니다.`,
    };
  }
  return { value };
}

/**
 * 계산 경계용. 빈칸이면 `undefined`, 오류면 `"라벨: 문구"` 로 던진다.
 * 계산 버튼의 오류 배너에 어느 칸인지 한국어 라벨로 보이게 한다.
 */
export function readNumber(label: string, parsed: ParsedNumber): number | undefined {
  if (parsed.error !== undefined) throw new Error(`${label}: ${parsed.error}`);
  return parsed.value;
}

/** 칸 아래 한국어 오류. 잘못된 입력은 기본값으로 바꾸지 않고 여기 보이며 계산을 막는다. */
export function FieldError({ message }: { message: string | undefined }) {
  return message ? (
    <span role="alert" className="text-xs font-normal text-red-700 dark:text-red-300">
      {message}
    </span>
  ) : null;
}
