import { parseIsoDateUtc } from "../days";
import { computePeriod } from "../period";
import type { PeriodDeps, PeriodUnit } from "../period";
import { deadlinesVersionTag, getDeadline, getSourceLaw, loadDeadlines } from "./dataset";
import type {
  DeadlineDataset,
  DeadlineHolidayRollover,
  DeadlineImmutable,
  DeadlineInput,
  DeadlineItem,
  DeadlineResult,
} from "./types";

const PREFIX = "법정기한 계산 입력 검증 실패";

const UNIT_LABEL: Record<PeriodUnit, string> = {
  day: "일",
  week: "주",
  month: "개월",
  year: "년",
};

/**
 * 화면 표시용 불변기간 라벨.
 *
 * `unstated` 를 "불변기간 아님"으로 적으면 안 된다. 조사 결과 가사 계열 3건은 법령에
 * 표시가 없어 판정하지 않은 것이지, 불변기간이 아니라고 확인된 것이 아니다.
 */
const IMMUTABLE_LABEL: Record<DeadlineImmutable, string> = {
  yes: "불변기간",
  no: "불변기간 아님",
  unstated: "법령에 표시 없음",
};

/**
 * 법정기한 계산. 기산 사건일과 기한 id 를 받아 만료일을 낸다.
 *
 * 기간 산술은 하지 않는다. 데이터셋의 `length` / `unit` / `firstDayIncluded` /
 * `holidayRollover` 를 `computePeriod` 의 입력으로 옮기고 결과를 그대로 싣는다.
 *
 * `deps` 는 필수다. 없으면 말일이 공휴일인 날이 그대로 `expiryDate` 에 실려, 상소기간
 * 만료일이 될 수 없는 날이 그럴듯한 답으로 나간다. `createHolidayDeps()` 는 인자 없이
 * 언제나 만들 수 있으므로 필수로 두어도 호출자가 곤란하지 않다. 커버리지 밖 만료일은
 * `deps` 가 있어도 판정하지 못하며, 그때는 `outOfCoverage` 로 남긴다.
 *
 * 근거 문구는 항목 데이터를 따라간다. 민사 계열은 민법 제161조, 형사 계열은
 * 형사소송법 제66조 제3항이 말일 규칙의 근거이고, 결론이 같아 보여도 조문이 다르다.
 * 같은 이유로 기간 엔진에 넘기는 조문 라벨도 `periodRules.articles` 에서 계열별로 꺼낸다.
 *
 * @throws 입력이 잘못되었거나 기한 id 가 데이터셋에 없으면 RangeError.
 */
export function computeDeadline(
  input: DeadlineInput,
  deps: PeriodDeps,
  dataset?: DeadlineDataset,
): DeadlineResult {
  const ds = loadDeadlines(dataset);
  validateDeadlineInput(input, ds);
  const item = getDeadline(input.id, ds);

  const useAlternate = input.useAlternate === true;
  const length = useAlternate && item.alternate ? item.alternate.length : item.length;
  const unit = useAlternate && item.alternate ? item.alternate.unit : item.unit;
  const lengthTextKo = `${length}${UNIT_LABEL[unit]}`;

  const law = getSourceLaw(ds, item.lawKey);
  // 조문 라벨을 계열에 맞게 넘긴다. 넘기지 않으면 기간 엔진이 민법 세트를 쓰고,
  // 형사 항목 결과에 적용되지 않는 민법 조문이 실린다.
  const period = computePeriod(
    {
      from: input.startEventDate,
      unit,
      count: length,
      includeFirstDay: item.firstDayIncluded,
      holidayExtension: item.holidayRollover,
    },
    deps,
    ds.periodRules.articles[law.family],
  );

  const holidayRollover = describeRollover(item, period.expiryDate, period.holidayExtension);

  return {
    id: item.id,
    groupKo: item.groupKo,
    labelKo: item.labelKo,
    lawNameKo: law.name,
    startEventDate: input.startEventDate,
    startEventKo: item.startEventKo,
    lengthTextKo,
    ...(useAlternate && item.alternate ? { appliedAlternateKo: item.alternate.conditionKo } : {}),
    expiryDate: period.expiryDate,
    period,
    holidayRollover,
    immutable: item.immutable,
    immutableLabelKo: IMMUTABLE_LABEL[item.immutable],
    immutableSourceArticle: item.immutableSourceArticle,
    sourceArticle: item.sourceArticle,
    sourceQuote: item.sourceQuote,
    ...(item.note !== undefined ? { noteKo: item.note } : {}),
    periodRuleKo: {
      firstDay: ds.periodRules.firstDayExcluded[law.family],
      endOfPeriod: ds.periodRules.endOfPeriod[law.family],
    },
    // 조문 번호를 넣지 않고 날짜 흐름만 적는다. 근거 조문은 `period.articles` ·
    // `periodRuleKo` · `holidayRollover.basisKo` · `sourceArticle` 이 계열에 맞게 따로 낸다.
    formulaText:
      `${item.groupKo} ${item.labelKo}: ${item.startEventKo} ${input.startEventDate}` +
      ` → 기산일 ${period.startDate}` +
      ` → ${lengthTextKo}${useAlternate && item.alternate ? ` (${item.alternate.conditionKo})` : ""} 경과` +
      ` → 말일 조정 전 만료일 ${period.rawExpiry}` +
      ` → 만료일 ${period.expiryDate}`,
    dataVersion: deadlinesVersionTag(ds),
  };
}

/**
 * 입력값 자체의 검증. 공휴일 deps 유무는 보지 않는다.
 *
 * `validatePeriodInput` 과 같은 이유다. `.lcalc` 파서 자리에는 deps 가 없고, 저장된 입력에
 * 말일 조정이 켜져 있다는 이유로 파일이 안 열리면 안 된다.
 *
 * @throws 값이 잘못되면 한국어 RangeError.
 */
export function validateDeadlineInput(input: DeadlineInput, dataset?: DeadlineDataset): void {
  if (input === null || typeof input !== "object") {
    throw new RangeError(`${PREFIX}: 입력 객체가 필요합니다.`);
  }
  parseIsoDateUtc(input.startEventDate);
  const item = getDeadline(input.id, dataset);
  if (input.useAlternate === true && item.alternate === undefined) {
    throw new RangeError(
      `${PREFIX}: 기한 "${item.id}" (${item.labelKo}) 에는 조건별 대체 기간이 없습니다.`,
    );
  }
}

function describeRollover(
  item: DeadlineItem,
  expiryDate: string,
  status: DeadlineHolidayRollover["status"],
): DeadlineHolidayRollover {
  const basisKo = item.holidayRolloverBasis;
  const reasonKo = {
    applied: `말일이 토요일 또는 공휴일이어서 만료일이 ${expiryDate} 로 밀렸습니다.`,
    notApplied: "말일이 근무일이라 조정하지 않았습니다.",
    outOfCoverage:
      "말일이 공휴일 데이터 커버리지 밖이거나 토요일 말일 연장 시행일(2008-03-22) 이전 구간이라 조정 여부를 확인하지 못했습니다. 만료일을 직접 확인하십시오.",
    off: "이 기한은 말일이 토요일·공휴일이어도 밀리지 않는 항목이라 조정하지 않았습니다.",
  }[status];
  return { status, basisKo, reasonKo: `${reasonKo} 근거: ${basisKo}` };
}
