import { parseIsoDateUtc } from "../days";
import { DEFAULT_DEADLINE_DATASET } from "./dataset.generated";
import type {
  DeadlineDataset,
  DeadlineFamily,
  DeadlineImmutable,
  DeadlineItem,
  DeadlineSourceLaw,
} from "./types";

/**
 * 법정기한 dataset. `data/deadlines/v1.json` 이 single source 이고
 * `scripts/sync-deadlines.mjs` 가 빌드 타임에 `dataset.generated.ts` 로 인라인한다.
 *
 * 담은 것은 법령 원문에서 **기간 길이와 기산점을 모두 확인한** 상소·이의신청 기간이다.
 * 특허·도산·헌법재판·과태료 절차는 이 판에 없다 (`coverageNote`).
 */
const DEFAULT_DATASET: DeadlineDataset = DEFAULT_DEADLINE_DATASET;

const UNITS = ["day", "week", "month", "year"];
const IMMUTABLE_VALUES: readonly DeadlineImmutable[] = ["yes", "no", "unstated"];
const FAMILIES: readonly DeadlineFamily[] = ["civil", "criminal"];

function validate(dataset: DeadlineDataset): void {
  if (!dataset.version || !dataset.updatedAt) {
    throw new Error("DeadlineDataset: version/updatedAt are required");
  }
  parseIsoDateUtc(dataset.updatedAt);
  const rules = dataset.periodRules;
  if (!rules?.firstDayExcluded?.civil || !rules.firstDayExcluded.criminal) {
    throw new Error("DeadlineDataset: periodRules.firstDayExcluded.civil/criminal are required");
  }
  if (!rules.endOfPeriod?.civil || !rules.endOfPeriod.criminal) {
    throw new Error("DeadlineDataset: periodRules.endOfPeriod.civil/criminal are required");
  }
  for (const [key, law] of Object.entries(dataset.sourceLaws)) {
    if (!law.name) {
      throw new Error(`DeadlineDataset: sourceLaws["${key}"].name 이 비었습니다`);
    }
    if (!FAMILIES.includes(law.family)) {
      throw new RangeError(
        `DeadlineDataset: sourceLaws["${key}"] 의 기간 규칙 계열이 "${law.family}" 입니다. civil / criminal 중 하나로 밝혀야 합니다`,
      );
    }
  }
  for (const family of FAMILIES) {
    const labels = rules.articles?.[family];
    // endOfPeriod / monthEndClip 은 대응 조문이 없는 계열이 있어 빈 문자열을 허용한다.
    if (
      labels === undefined ||
      typeof labels.endOfPeriod !== "string" ||
      typeof labels.monthEndClip !== "string" ||
      !labels.firstDay ||
      !labels.calendar ||
      !labels.holidayRollover ||
      !labels.noteKo
    ) {
      throw new Error(
        `DeadlineDataset: periodRules.articles.${family} 의 조문 라벨이 비었습니다 (firstDay/calendar/holidayRollover/noteKo 는 필수, endOfPeriod/monthEndClip 은 문자열)`,
      );
    }
  }
  if (!Array.isArray(dataset.deadlines) || dataset.deadlines.length === 0) {
    throw new Error("DeadlineDataset: deadlines must be a non-empty array");
  }

  const seen = new Set<string>();
  for (const [i, item] of dataset.deadlines.entries()) {
    const at = `deadlines[${i}]`;
    if (!item.id || !item.labelKo || !item.groupKo || !item.startEventKo) {
      throw new Error(`${at}: id/labelKo/groupKo/startEventKo are required`);
    }
    if (seen.has(item.id)) {
      throw new RangeError(`${at}: duplicate id "${item.id}"`);
    }
    seen.add(item.id);
    if (dataset.sourceLaws[item.lawKey] === undefined) {
      throw new RangeError(`${at} ("${item.id}"): 알 수 없는 lawKey "${item.lawKey}"`);
    }
    if (!UNITS.includes(item.unit)) {
      throw new RangeError(`${at} ("${item.id}"): 알 수 없는 unit "${item.unit}"`);
    }
    if (!Number.isInteger(item.length) || item.length < 1) {
      throw new RangeError(`${at} ("${item.id}"): length 는 1 이상의 정수여야 합니다`);
    }
    if (!IMMUTABLE_VALUES.includes(item.immutable)) {
      throw new RangeError(`${at} ("${item.id}"): 알 수 없는 immutable "${item.immutable}"`);
    }
    // 문자열 "false" 는 truthy 라 그대로 읽으면 초일 산입·말일 조정이 뒤집힌다.
    if (typeof item.firstDayIncluded !== "boolean" || typeof item.holidayRollover !== "boolean") {
      throw new RangeError(
        `${at} ("${item.id}"): firstDayIncluded / holidayRollover 는 boolean 이어야 합니다`,
      );
    }
    if (!item.immutableSourceArticle || !item.holidayRolloverBasis || !item.sourceArticle) {
      throw new Error(
        `${at} ("${item.id}"): immutableSourceArticle/holidayRolloverBasis/sourceArticle are required`,
      );
    }
    if (item.alternate !== undefined) {
      if (!item.alternate.conditionKo || !UNITS.includes(item.alternate.unit)) {
        throw new RangeError(`${at} ("${item.id}"): alternate.conditionKo/unit 이 잘못되었습니다`);
      }
      if (!Number.isInteger(item.alternate.length) || item.alternate.length < 1) {
        throw new RangeError(`${at} ("${item.id}"): alternate.length 는 1 이상의 정수여야 합니다`);
      }
    }
  }
}

/**
 * 기본 인라인 dataset 또는 호출자가 제공한 외부 dataset 을 검증해 반환한다.
 *
 * @internal core-engine 내부 전용. 외부 consumer 는 `computeDeadline(input, deps, dataset)` 로 주입한다.
 */
export function loadDeadlines(dataset?: DeadlineDataset): DeadlineDataset {
  const loaded = dataset ?? DEFAULT_DATASET;
  validate(loaded);
  return loaded;
}

/**
 * 항목의 `lawKey` 가 가리키는 법령. 없으면 대체값을 만들지 않고 거부한다.
 *
 * @throws dataset 에 없는 lawKey 면 RangeError.
 */
export function getSourceLaw(dataset: DeadlineDataset, lawKey: string): DeadlineSourceLaw {
  const law = dataset.sourceLaws[lawKey];
  if (law === undefined) {
    throw new RangeError(`getSourceLaw: 알 수 없는 lawKey "${lawKey}"`);
  }
  return law;
}

/** dataset 식별자 (`deadlines/vX.Y.Z`). */
export function deadlinesVersionTag(dataset: DeadlineDataset): string {
  return `deadlines/v${dataset.version}`;
}

/** 담긴 기한 목록. 데이터셋 순서를 그대로 낸다 (계열별로 묶여 있다). */
export function listDeadlines(dataset?: DeadlineDataset): DeadlineItem[] {
  return loadDeadlines(dataset).deadlines;
}

/** 기한 id 조회. 데이터셋에 없으면 RangeError. */
export function getDeadline(id: string, dataset?: DeadlineDataset): DeadlineItem {
  const ds = loadDeadlines(dataset);
  const item = ds.deadlines.find((d) => d.id === id);
  if (item === undefined) {
    throw new RangeError(`getDeadline: 기한 id "${id}" 가 본 dataset 에 없습니다`);
  }
  return item;
}
