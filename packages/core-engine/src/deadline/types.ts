import type {
  HolidayExtensionStatus,
  PeriodArticleLabels,
  PeriodResult,
  PeriodUnit,
} from "../period";
import type { IsoDate } from "../types";

/**
 * 근거 조문이 그 기간을 불변기간으로 정했는지.
 *
 * - `yes`: 조문이 명시적으로 불변기간으로 정했다 (`immutableSourceArticle` 에 그 항).
 * - `no`: 그 절차법에 불변기간 규정이 없거나, 인접 항만 불변기간이고 이 항은 아니다.
 * - `unstated`: 법령에 아무 표시가 없어 조문만으로는 판정할 수 없다.
 *
 * **`unstated` 를 `no` 로 뭉개지 않는다.** "불변기간이 아니다"는 법적 판단이고,
 * "조문에 표시가 없다"는 사실이다. 가사 계열 3건이 여기 해당한다.
 */
export type DeadlineImmutable = "yes" | "no" | "unstated";

/** 같은 항 안에서 조건에 따라 길이가 달라지는 경우 (국외 체류 등). */
export interface DeadlineAlternate {
  conditionKo: string;
  length: number;
  unit: PeriodUnit;
}

export interface DeadlineItem {
  id: string;
  groupKo: string;
  labelKo: string;
  /** `DeadlineDataset.sourceLaws` 의 키. */
  lawKey: string;
  /** 조문이 적은 기산 기준. 송달일·고지일·선고일이 조문마다 다르다. */
  startEventKo: string;
  length: number;
  unit: PeriodUnit;
  firstDayIncluded: boolean;
  alternate?: DeadlineAlternate;
  immutable: DeadlineImmutable;
  /** `immutable` 이 `yes` 가 아니면 "없음" 또는 그 사유. 원문 그대로 싣는다. */
  immutableSourceArticle: string;
  holidayRollover: boolean;
  /** 말일 조정의 근거. 민사 계열은 민법 제161조, 형사 계열은 형사소송법 제66조 제3항. */
  holidayRolloverBasis: string;
  /**
   * 기간과 기산점의 근거 조문. 항목에 따라 두 조문을 함께 적거나
   * (형사: 길이와 기산점이 다른 조문) 법령명을 포함한다 (가사비송: 법률과 규칙).
   * 그래서 `lawNameKo` 를 앞에 붙여 조립하면 안 된다.
   */
  sourceArticle: string;
  sourceQuote: string;
  note?: string;
}

/**
 * 기간 규칙 계열. 결론이 같아 보여도 근거 조문이 다르다.
 *
 * 법령마다 데이터셋이 밝힌다. 코드가 lawKey 로 추정하면 아직 기간 규정을 확인하지 않은
 * 법령(특허·도산·헌법재판·과태료)이 조용히 민사로 떨어진다.
 */
export type DeadlineFamily = "civil" | "criminal";

export interface DeadlineSourceLaw {
  name: string;
  family: DeadlineFamily;
  lsId: string;
  mst: number;
  promulgatedOn: IsoDate;
  promulgationNumber: string;
  currentEffectiveFrom: IsoDate;
  sourceUrl: string;
  sourceRef: string;
}

/** 계열별 기간 규칙. 민사와 형사는 결론이 같아 보여도 근거 조문이 다르다. */
export interface DeadlinePeriodRules {
  firstDayExcluded: Record<DeadlineFamily, string>;
  endOfPeriod: Record<DeadlineFamily, string>;
  /**
   * 계산 단계마다 결과에 실을 조문 라벨. 위 두 문장이 서술로 적은 근거를
   * 기간 엔진이 그대로 인용할 수 있는 단위로 쪼갠 것이다.
   *
   * 형사 계열에는 대응 조문이 없는 자리가 있고 그 자리는 빈 문자열이다
   * (`fieldNotes.periodArticles`).
   */
  articles: Record<DeadlineFamily, PeriodArticleLabels>;
  applicability: string;
}

export interface DeadlineDataset {
  version: string;
  updatedAt: IsoDate;
  coverageNote: string;
  sourceLaws: Record<string, DeadlineSourceLaw>;
  periodRules: DeadlinePeriodRules;
  fieldNotes: Record<string, string>;
  deadlines: DeadlineItem[];
}

export interface DeadlineInput {
  /** 기한 id. `listDeadlines` 가 내는 값 중 하나. */
  id: string;
  /** 기산 사건일. 판결서 송달일·재판 고지일·처분을 안 날 등, 항목의 `startEventKo` 가 정한 날. */
  startEventDate: IsoDate;
  /**
   * 항목에 `alternate` 가 있을 때 그 조건(국외 체류 등)의 기간을 쓸지.
   * `alternate` 가 없는 항목에 켜면 RangeError.
   */
  useAlternate?: boolean;
}

/**
 * 말일 조정 결과. 상태는 `computePeriod` 의 판정을 그대로 쓰고, 근거는 항목 데이터를 따른다.
 *
 * `computeDeadline` 이 공휴일 deps 를 필수로 받으므로 `off` 는 항목이
 * `holidayRollover: false` 인 경우 하나뿐이다. 판정 실패는 `outOfCoverage` 다.
 */
export interface DeadlineHolidayRollover {
  status: HolidayExtensionStatus;
  /** 항목의 `holidayRolloverBasis`. 민사와 형사가 다르다. */
  basisKo: string;
  reasonKo: string;
}

export interface DeadlineResult {
  id: string;
  groupKo: string;
  labelKo: string;
  /** `lawKey` 가 가리키는 법령명. `sourceArticle` 과 붙여 쓰지 말 것 (조문에 법령명이 든 항목이 있다). */
  lawNameKo: string;
  startEventDate: IsoDate;
  startEventKo: string;
  /** 적용한 기간 표기. 조문 원문 표기를 따른다 ("2주" / "14일"). */
  lengthTextKo: string;
  /** `alternate` 를 적용했으면 그 조건. 적용하지 않았으면 없다. */
  appliedAlternateKo?: string;
  /** 말일 조정까지 마친 만료일. `period.expiryDate` 와 같다. */
  expiryDate: IsoDate;
  /** 기간 계산 결과 원본. 기산일·조정 전 만료일·적용 조문이 그대로 들어 있다. */
  period: PeriodResult;
  holidayRollover: DeadlineHolidayRollover;
  immutable: DeadlineImmutable;
  /** 화면 표시용 3값 라벨. `unstated` 는 "법령에 표시 없음"이지 "불변기간 아님"이 아니다. */
  immutableLabelKo: string;
  immutableSourceArticle: string;
  sourceArticle: string;
  sourceQuote: string;
  /** 항목의 함정·예외 메모. 데이터셋에 있는 항목만. */
  noteKo?: string;
  /** 계열별 기간 규칙 근거. 민사 계열과 형사 계열이 다른 조문을 가리킨다. */
  periodRuleKo: { firstDay: string; endOfPeriod: string };
  formulaText: string;
  /** dataset 식별자 (`deadlines/vX.Y.Z`). */
  dataVersion: string;
}
