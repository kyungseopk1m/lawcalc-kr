import type { HolidayDataset } from "../holidays";
import { isBusinessDay, isCovered, loadHolidays, rollToNextBusinessDay } from "../holidays";
import type { PeriodDeps } from "./types";

/**
 * 공휴일 데이터셋을 기간 엔진의 의존성 모양으로 묶는다.
 *
 * 기간 엔진은 공휴일 데이터셋을 직접 알지 않도록 `PeriodDeps` 를 주입받는데, 그
 * 묶는 일을 호출자마다 손으로 하면 한 곳에서 `isCovered` 를 빠뜨렸을 때 커버리지
 * 밖 날짜가 조용히 연장 없이 지나간다. 묶는 방법을 하나로 둔다.
 */
export function createHolidayDeps(dataset?: HolidayDataset): PeriodDeps {
  const ds = loadHolidays(dataset);
  return {
    isBusinessDay: (date) => isBusinessDay(date, ds),
    rollToNextBusinessDay: (date) => rollToNextBusinessDay(date, ds),
    isCovered: (date) => isCovered(date, ds),
  };
}
