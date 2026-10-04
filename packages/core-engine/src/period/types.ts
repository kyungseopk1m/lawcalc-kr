import type { IsoDate } from "../types";

/** 기간의 단위. 민법 제160조는 주·월·년을 역법으로 계산하고 일은 그대로 센다. */
export type PeriodUnit = "day" | "week" | "month" | "year";

/**
 * 공휴일 판정 의존성. 기간 엔진은 공휴일 데이터셋을 직접 알지 않는다.
 *
 * 호출자가 `holidays.ts` 의 동명 함수를 그대로 묶어 주입한다. 커버리지 밖 날짜에
 * `isBusinessDay` / `rollToNextBusinessDay` 가 RangeError 를 던지는 계약도 그대로다.
 */
export interface PeriodDeps {
  isBusinessDay(date: IsoDate): boolean;
  rollToNextBusinessDay(date: IsoDate): { date: IsoDate; rolled: boolean; reasonKo?: string };
  isCovered(date: IsoDate): boolean;
}

/**
 * 결과에 실을 조문 라벨. 기간 엔진은 이 문자열이 어느 법의 조문인지 알지 않는다.
 * 계산 규칙은 같아도 근거 조문이 다른 계열(민사 = 민법, 형사 = 형사소송법)이 있어
 * 호출자가 넘긴다. 넘기지 않으면 민법 세트가 기본값이다.
 *
 * 대응 조문이 없는 자리는 **빈 문자열**로 둔다. 없는 조문을 지어내지 않고, 그 자리에서는
 * 조문 표기 없이 사유만 적는다.
 */
export interface PeriodArticleLabels {
  /** 초일 산입 여부를 정한 조문. 빈 값을 허용하지 않는다. */
  firstDay: string;
  /** 말일의 종료로 기간이 만료한다는 조문. */
  endOfPeriod: string;
  /** 주·월·연을 역법으로 계산한다는 조문. */
  calendar: string;
  /** 최종 월에 해당일이 없으면 그 월의 말일로 만료한다는 조문. */
  monthEndClip: string;
  /** 말일이 토요일·공휴일일 때의 조문. 빈 값을 허용하지 않는다. */
  holidayRollover: string;
  /** 이 계산이 어느 규정에 따른 것인지의 고지. `PeriodResult.noteKo` 로 그대로 나간다. */
  noteKo: string;
}

export interface PeriodInput {
  /** 기간의 기초가 되는 날 (계약일·송달일 등). 이 날 자체가 기산일인지는 아래 옵션이 정한다. */
  from: IsoDate;
  unit: PeriodUnit;
  /** 기간의 수량. 1 이상의 정수. */
  count: number;
  /**
   * 민법 제157조 단서. 기간이 오전 0시로부터 시작하는 때에는 초일을 산입한다.
   * 기본값 false (제157조 본문의 초일 불산입 원칙).
   */
  includeFirstDay?: boolean;
  /**
   * 민법 제161조. 기간의 말일이 토요일 또는 공휴일이면 기간은 그 익일로 만료한다.
   * 기본값 false. true 로 켤 때는 `PeriodDeps` 를 함께 넘겨야 한다.
   */
  holidayExtension?: boolean;
}

/**
 * 제161조 적용 결과.
 *
 * - `off`: 옵션을 켜지 않아 판정하지 않음
 * - `notApplied`: 판정했고 말일이 근무일이라 조정 없음
 * - `applied`: 말일이 토요일·공휴일이라 익일로 연장
 * - `outOfCoverage`: 옵션을 켰으나 공휴일 데이터 커버리지 밖이라 **판정하지 못함**
 *
 * `outOfCoverage` 를 `notApplied` 와 합치지 않는다. 판정 결과가 "연장 없음"인 것과
 * 판정 자체를 못 한 것은 사용자에게 다른 사실이다.
 */
export type HolidayExtensionStatus = "off" | "notApplied" | "applied" | "outOfCoverage";

export interface PeriodResult {
  /** 민법 제157조 적용 후의 기산일. 초일 불산입이면 `from` 의 익일. */
  startDate: IsoDate;
  /** 제159조·제160조까지만 적용한 만료일. 제161조 조정 전. */
  rawExpiry: IsoDate;
  /** 제161조까지 적용한 최종 만료일. 조정이 없으면 `rawExpiry` 와 같다. */
  expiryDate: IsoDate;
  holidayExtension: HolidayExtensionStatus;
  /** `holidayExtension` 이 `applied` / `outOfCoverage` 일 때의 한국어 사유. */
  adjustmentReasonKo?: string;
  /** 산식에 실제로 적용한 조문. 주입된 라벨을 따르고, 빈 라벨은 담지 않는다. */
  articles: string[];
  /** 왜 그 날짜가 나왔는지의 서술. 화면·PDF 에 그대로 실린다. */
  formulaText: string;
  /** 어느 규정에 따른 계산인지의 고지. 기본값은 민법 제155조 고지다. */
  noteKo: string;
}

export interface DateSpanInput {
  from: IsoDate;
  /** `from` 이후(같은 날 포함)의 날. */
  to: IsoDate;
  /** 민법 제157조 단서. 기본값 false. */
  includeFirstDay?: boolean;
}

export interface DateSpanResult {
  /** 제157조를 적용한 기산일. */
  startDate: IsoDate;
  /** 기산일부터 `to` 까지의 일수. 말일 산입. */
  days: number;
  /** 참고용 역법 환산: `years`년 `months`개월 `days`일. 법정 기간 판정 자체는 `days` 로 한다. */
  calendar: { years: number; months: number; days: number };
  articles: string[];
  formulaText: string;
  noteKo: string;
}
