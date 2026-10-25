import type { HolidayDataset, HolidayRecord } from "../holidays";
import {
  isBusinessDay,
  isCovered,
  loadHolidays,
  rollToNextBusinessDay,
  withExtraHolidays,
} from "../holidays";
import type { PeriodDeps } from "./types";

/**
 * 공휴일 데이터셋을 기간 엔진의 의존성 모양으로 묶는다.
 *
 * 기간 엔진은 공휴일 데이터셋을 직접 알지 않도록 `PeriodDeps` 를 주입받는데, 그
 * 묶는 일을 호출자마다 손으로 하면 한 곳에서 `isCovered` 를 빠뜨렸을 때 커버리지
 * 밖 날짜가 조용히 연장 없이 지나간다. 묶는 방법을 하나로 둔다.
 *
 * `extraHolidays` 는 사용자가 지정한 임시공휴일·선거일이다. dataset 에 합쳐 같은 판정을 탄다
 * (`withExtraHolidays`). 커버리지 밖 날짜나 빈 이름은 RangeError.
 */
export function createHolidayDeps(
  dataset?: HolidayDataset,
  extraHolidays: readonly HolidayRecord[] = [],
): PeriodDeps {
  const ds = withExtraHolidays(loadHolidays(dataset), extraHolidays);
  return {
    isBusinessDay: (date, options) => isBusinessDay(date, ds, options),
    rollToNextBusinessDay: (date, options) => rollToNextBusinessDay(date, ds, options),
    isCovered: (date) => isCovered(date, ds),
  };
}
