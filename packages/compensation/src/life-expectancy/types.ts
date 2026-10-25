/**
 * 기대여명·여명종료일 타입.
 *
 * 생명표는 기준일(사고일, 또는 감정일 기준을 고르면 감정일)이 속한 해의 사망률 기준연도 표를 쓰고,
 * 나이는 기준일 현재 만 나이(정수)다. 보간하지 않는다.
 * 여명종료일 = 기준일 + floor(여명(년) × 365)일. 윤년을 따지지 않고 소수 일은 버린다.
 */

import type { IsoDate } from "@lawcalc-kr/core-engine";
import type { LifeExpectancyDataset, LifeExpectancySex } from "@lawcalc-kr/datasets-compensation";

/**
 * 여명단축.
 * - `subtractYears`: 새 여명 = 정상 여명 − `years`.
 * - `remainingYears`: 새 여명 = `years` (기준일부터 남은 여명).
 * - `percent`: 새 여명 = 정상 여명 × `percent`/100. `percent` 는 남는 비율이다(30 이면 30%만 남는다).
 *
 * `years`·`percent` 는 소수 둘째 자리까지 받는다.
 */
export type LifeShortening =
  | { method: "subtractYears"; years: number }
  | { method: "remainingYears"; years: number }
  | { method: "percent"; percent: number };

export interface LifeExpectancyInput {
  sex: LifeExpectancySex;
  birthDate: IsoDate;
  accidentDate: IsoDate;
  /** 기준일. 미지정 시 `"accident"`. `"appraisal"` 이면 정상 여명도 감정 연도 표·감정 당시 나이로 계산한다. */
  basis?: "accident" | "appraisal";
  /** 신체감정일. `basis === "appraisal"` 일 때 필수 (사고일 이후). */
  appraisalDate?: IsoDate;
  shortening?: LifeShortening;
  /** 사용자가 직접 지정한 여명종료일. 있으면 자동값(정상·단축)보다 우선한다. */
  endDateOverride?: IsoDate;
  /**
   * 생명표 사망률 기준연도 직접 선택. 있으면 기준일 연도 대신 이 연도 표를 쓰고 대체 경고를 내지 않는다.
   * 수록되지 않은 연도면 RangeError.
   */
  tableYear?: number;
}

/**
 * 손해배상 엔진(부상·사망)에 붙이는 기대여명 입력. 성별·생년월일·사고일은 `base` 에서 가져온다.
 */
export type CompensationLifeExpectancyInput = Pick<
  LifeExpectancyInput,
  "basis" | "appraisalDate" | "shortening" | "endDateOverride" | "tableYear"
>;

export interface LifeExpectancyWarning {
  /** `lifeTableFallback`: 기준일 연도 생명표가 없어 수록된 최신 표를 썼다. */
  code: "lifeTableFallback";
  message: string;
}

export interface LifeExpectancyResult {
  /** 기준일 (사고일 또는 감정일). */
  baseDate: IsoDate;
  /** 기준일 현재 만 나이. */
  age: number;
  /** 사용한 생명표의 사망률 기준연도. */
  tableYear: number;
  /** 정상 기대여명 (년, 표 값 그대로). */
  remainingYears: number;
  /** 정상 여명종료일. */
  normalEndDate: IsoDate;
  /** 단축 후 여명 (년). 단축 입력이 있을 때만. 백분율 방식은 소수 둘째 자리를 넘을 수 있다. */
  shortenedRemainingYears?: number;
  /** 단축된 여명종료일. 단축 입력이 있을 때만. */
  shortenedEndDate?: IsoDate;
  /** 최종 여명종료일 = 직접 지정 > 단축 > 정상. */
  endDate: IsoDate;
  /** `endDate` 가 직접 지정값인지. */
  endDateOverridden: boolean;
  warnings: LifeExpectancyWarning[];
}

export interface LifeExpectancyDeps {
  /** 생명표 주입. 미지정 시 기본 데이터셋. */
  lifeExpectancy?: LifeExpectancyDataset;
}
