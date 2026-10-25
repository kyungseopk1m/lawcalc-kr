/**
 * 사칙연산 계산기. 부동소수점을 쓰지 않고 BigInt 유리수로 정확하게 계산한 뒤, 요청한
 * 소수 자릿수에서 한 번만 끝수를 처리한다 (66.665 를 2자리 사사오입하면 66.67).
 *
 * 입력 규칙:
 *   - 연산자 `+ - * / × ÷`, `x`·`X` 는 곱하기. 전각 숫자·연산자·괄호도 받는다. 단 `0x10` 처럼
 *     홀로 선 0 바로 뒤의 `x` 는 16진 표기로 읽힐 수 있어 오류로 둔다 (`0 × 10` 은 띄우면 된다).
 *   - 괄호 `( ) [ ] { }`. 여는 괄호와 닫는 괄호의 종류가 맞아야 한다.
 *   - 숫자 안의 쉼표(천 단위 구분)는 무시한다.
 *   - 공백과 "원"·"개월" 같은 한글 단위 표기는 토큰 사이에서 무시한다. 그 밖의 문자는 오류다.
 *   - 수 단위 글자(십·백·천·만·억·조·경)는 오류다. 버리면 "1억" 이 1 이 된다.
 *   - 짝이 맞지 않는 괄호, 0 으로 나누기, 연산자만 있고 피연산자가 없는 식은 오류.
 *
 * 끝수 처리 (`digits` 자리에서):
 *   - `floor` / `ceil`: 수학적 내림·올림. 음수에서는 0 쪽이 아니라 수직선 방향이다
 *     (-1.234 를 2자리 floor 하면 -1.24, ceil 하면 -1.23).
 *   - `round`: 사사오입. 5 이상은 0 에서 먼 쪽으로 올린다 (-1.235 → -1.24).
 *   - `digits: "full"`: 소수 10자리까지 잘라서(0 쪽으로) 보여 주고, 그 뒤에 0 이 아닌 자리가
 *     남으면 `moreDigits: true` 로 알린다. `rounding` 은 쓰지 않는다.
 */

export type CalculatorDigits = 0 | 1 | 2 | 3 | 4 | 5 | "full";
export type CalculatorRounding = "floor" | "round" | "ceil";

export interface CalculatorOptions {
  digits: CalculatorDigits;
  rounding: CalculatorRounding;
}

export interface CalculatorResult {
  /** 정규화한 식. 숫자는 쉼표 없이, 연산자는 `+ - × ÷`, 괄호는 `( )`. */
  normalizedExpr: string;
  /** 끝수 처리를 마친 십진 문자열 (쉼표 없음, `-` 부호). */
  value: string;
  /** `value` 에 천 단위 쉼표를 넣은 표시 문자열. */
  display: string;
  /** `digits: "full"` 에서 10자리 뒤에 0 이 아닌 자리가 더 있으면 true. */
  moreDigits: boolean;
}

const PREFIX = "계산식 오류";
const MAX_LENGTH = 2000;
const FULL_DIGITS = 10;

interface Rational {
  n: bigint;
  d: bigint;
}

type Token =
  | { kind: "num"; value: Rational; text: string }
  | { kind: "op"; op: "+" | "-" | "*" | "/" }
  | { kind: "open"; close: string }
  | { kind: "close"; char: string };

const OPEN: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

function make(n: bigint, d: bigint): Rational {
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n, d);
  return g > 1n ? { n: n / g, d: d / g } : { n, d };
}

/** 전각 문자(！~～)를 반각으로, 그 밖의 기호 표기를 ASCII 로 바꾼다. */
function normalizeChars(text: string): string {
  const half = text.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  // 숫자 바로 뒤(공백 허용)의 수 단위만 거절한다. "조정비용 1000" 같은 설명 글자는 건너뛴다.
  const unit = /[0-9.]\s*([십백천만억조경])/.exec(half);
  if (unit) {
    throw new RangeError(
      `${PREFIX}: 수 단위 글자('${unit[1]}')는 지원하지 않습니다. 숫자로 입력하세요 (예: 1억 → 100000000).`,
    );
  }
  if (/(?:^|[^\d.,])0[xX]/.test(half)) {
    throw new RangeError(
      `${PREFIX}: '0x' 는 16진 표기로 읽힐 수 있어 계산하지 않습니다. 곱하기라면 0 × 10 처럼 띄우세요.`,
    );
  }
  return half
    .replace(/[×xX]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[\u2212\u2013\u2014]/g, "-");
}

function tokenize(text: string): Token[] {
  const s = normalizeChars(text);
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    const num = /^(?:\d[\d,]*(?:\.\d*)?|\.\d+)/.exec(s.slice(i));
    if (num) {
      const raw = num[0].replace(/,/g, "");
      const [intPart, frac = ""] = raw.split(".");
      tokens.push({
        kind: "num",
        value: make(BigInt((intPart ?? "") + frac || "0"), 10n ** BigInt(frac.length)),
        text: raw.endsWith(".") ? raw.slice(0, -1) : raw.startsWith(".") ? `0${raw}` : raw,
      });
      i += num[0].length;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") tokens.push({ kind: "op", op: c });
    else if (c in OPEN) tokens.push({ kind: "open", close: OPEN[c]! });
    else if (c === ")" || c === "]" || c === "}") tokens.push({ kind: "close", char: c });
    else if (!/[\s\p{Script=Hangul}]/u.test(c)) {
      // 공백과 한글(원·개월 같은 단위 표기)만 건너뛴다. % · 지수 e · 위첨자 · 다른 문자 체계의
      // 숫자를 말없이 버리면 "12%" 가 12 로 계산되는 식의 틀린 값이 나온다.
      throw new RangeError(`${PREFIX}: 계산할 수 없는 문자 '${c}' 가 있습니다.`);
    }
    i += 1;
  }
  return tokens;
}

class Parser {
  private pos = 0;
  readonly parts: string[] = [];
  constructor(private readonly tokens: Token[]) {}

  parse(): Rational {
    if (this.tokens.length === 0) throw new RangeError(`${PREFIX}: 계산할 식이 없습니다.`);
    const value = this.expr(0);
    const rest = this.tokens[this.pos];
    if (rest !== undefined) {
      throw new RangeError(
        rest.kind === "close"
          ? `${PREFIX}: 닫는 괄호 '${rest.char}' 에 맞는 여는 괄호가 없습니다.`
          : `${PREFIX}: 숫자와 숫자(또는 괄호) 사이에 연산자가 없습니다.`,
      );
    }
    return value;
  }

  private expr(depth: number): Rational {
    let left = this.term(depth);
    for (let t = this.tokens[this.pos]; t?.kind === "op" && (t.op === "+" || t.op === "-");) {
      this.pos += 1;
      this.parts.push(t.op);
      const right = this.term(depth);
      left =
        t.op === "+"
          ? make(left.n * right.d + right.n * left.d, left.d * right.d)
          : make(left.n * right.d - right.n * left.d, left.d * right.d);
      t = this.tokens[this.pos];
    }
    return left;
  }

  private term(depth: number): Rational {
    let left = this.factor(depth);
    for (let t = this.tokens[this.pos]; t?.kind === "op" && (t.op === "*" || t.op === "/");) {
      this.pos += 1;
      this.parts.push(t.op === "*" ? "×" : "÷");
      const right = this.factor(depth);
      if (t.op === "*") {
        left = make(left.n * right.n, left.d * right.d);
      } else {
        if (right.n === 0n) throw new RangeError(`${PREFIX}: 0 으로 나눌 수 없습니다.`);
        left = make(left.n * right.d, left.d * right.n);
      }
      t = this.tokens[this.pos];
    }
    return left;
  }

  private factor(depth: number): Rational {
    if (depth > 100) throw new RangeError(`${PREFIX}: 괄호가 너무 깊습니다.`);
    const t = this.tokens[this.pos];
    if (t === undefined) throw new RangeError(`${PREFIX}: 식이 연산자로 끝났습니다.`);
    this.pos += 1;
    if (t.kind === "num") {
      this.parts.push(t.text);
      return t.value;
    }
    if (t.kind === "op" && (t.op === "+" || t.op === "-")) {
      this.parts.push(t.op);
      const v = this.factor(depth + 1);
      return t.op === "-" ? { n: -v.n, d: v.d } : v;
    }
    if (t.kind === "open") {
      this.parts.push("(");
      const v = this.expr(depth + 1);
      const close = this.tokens[this.pos];
      if (close === undefined) throw new RangeError(`${PREFIX}: 괄호가 닫히지 않았습니다.`);
      if (close.kind !== "close" || close.char !== t.close) {
        throw new RangeError(
          close.kind === "close"
            ? `${PREFIX}: 괄호 종류가 맞지 않습니다 ('${t.close}' 가 와야 할 자리에 '${close.char}').`
            : `${PREFIX}: 숫자와 숫자(또는 괄호) 사이에 연산자가 없습니다.`,
        );
      }
      this.pos += 1;
      this.parts.push(")");
      return v;
    }
    throw new RangeError(
      t.kind === "close"
        ? `${PREFIX}: 닫는 괄호 '${t.char}' 앞에 숫자가 없습니다.`
        : `${PREFIX}: 연산자 앞에 숫자가 없습니다.`,
    );
  }
}

/** n/d 를 정수로 내림 (수직선 방향). d > 0. */
function floorDiv(n: bigint, d: bigint): bigint {
  const q = n / d;
  return n % d !== 0n && n < 0n ? q - 1n : q;
}

function roundScaled(x: Rational, scale: bigint, rounding: CalculatorRounding): bigint {
  const n = x.n * scale;
  if (rounding === "floor") return floorDiv(n, x.d);
  if (rounding === "ceil") return -floorDiv(-n, x.d);
  const abs = n < 0n ? -n : n;
  const q = (abs * 2n + x.d) / (2n * x.d);
  return n < 0n ? -q : q;
}

function formatScaled(q: bigint, digits: number): string {
  const neg = q < 0n;
  const s = (neg ? -q : q).toString().padStart(digits + 1, "0");
  const int = s.slice(0, s.length - digits);
  const frac = s.slice(s.length - digits);
  return `${neg ? "-" : ""}${int}${digits > 0 ? `.${frac}` : ""}`;
}

function withCommas(value: string): string {
  const [int, frac] = value.split(".");
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === undefined ? grouped : `${grouped}.${frac}`;
}

/**
 * 계산식을 평가한다.
 *
 * @throws 식이 잘못되었거나(괄호 짝, 0 으로 나누기, 피연산자 누락) 옵션이 잘못되면 한국어 RangeError.
 */
export function evaluateExpression(text: string, options: CalculatorOptions): CalculatorResult {
  if (typeof text !== "string") throw new RangeError(`${PREFIX}: 식은 문자열이어야 합니다.`);
  if (text.length > MAX_LENGTH) {
    throw new RangeError(`${PREFIX}: 식이 너무 깁니다 (${MAX_LENGTH}자 이하).`);
  }
  if (options === null || typeof options !== "object") {
    throw new RangeError(`${PREFIX}: 자릿수·끝수 옵션이 필요합니다.`);
  }
  const { digits, rounding } = options;
  if (digits !== "full" && !(Number.isInteger(digits) && digits >= 0 && digits <= 5)) {
    throw new RangeError(`${PREFIX}: digits 는 0~5 또는 "full" 이어야 합니다.`);
  }
  if (rounding !== "floor" && rounding !== "round" && rounding !== "ceil") {
    throw new RangeError(`${PREFIX}: rounding 은 floor / round / ceil 중 하나여야 합니다.`);
  }

  const parser = new Parser(tokenize(text));
  const x = parser.parse();
  const normalizedExpr = parser.parts.join(" ").replace(/\( /g, "(").replace(/ \)/g, ")");

  let value: string;
  let moreDigits = false;
  if (digits === "full") {
    const scale = 10n ** BigInt(FULL_DIGITS);
    // 0 쪽으로 자른다.
    const q = (x.n * scale) / x.d;
    moreDigits = (x.n * scale) % x.d !== 0n;
    value = formatScaled(q, FULL_DIGITS).replace(/\.?0+$/, "");
    if (value === "-0") value = "0";
  } else {
    value = formatScaled(roundScaled(x, 10n ** BigInt(digits), rounding), digits);
  }
  return { normalizedExpr, value, display: withCommas(value), moreDigits };
}
