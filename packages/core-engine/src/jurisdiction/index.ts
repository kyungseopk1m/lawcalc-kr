import { parseIsoDateUtc } from "../days";
import { DEFAULT_COURT_JURISDICTION_DATASET } from "./dataset.generated";
import type {
  CourtJurisdictionDataset,
  CourtJurisdictionInput,
  CourtJurisdictionResult,
  CourtJurisdictionSnapshot,
  CourtSet,
} from "./types";

export type {
  CourtJurisdictionDataset,
  CourtJurisdictionInput,
  CourtJurisdictionResult,
  CourtJurisdictionRow,
  CourtJurisdictionSnapshot,
  CourtJurisdictionUnit,
  CourtSet,
} from "./types";

/**
 * 관할법원 찾기. `data/court-jurisdiction/v1.json` 이 single source 다.
 * 「각급 법원의 설치와 관할구역에 관한 법률」 별표 3·7·10 을 시행일자별 판으로 담았다.
 */
export function loadCourtJurisdiction(
  dataset?: CourtJurisdictionDataset,
): CourtJurisdictionDataset {
  const ds = dataset ?? DEFAULT_COURT_JURISDICTION_DATASET;
  if (
    !ds.version ||
    !ds.snapshotDate ||
    !Array.isArray(ds.snapshots) ||
    ds.snapshots.length === 0
  ) {
    throw new Error("CourtJurisdictionDataset: version/snapshotDate/snapshots are required");
  }
  for (let i = 1; i < ds.snapshots.length; i++) {
    if (ds.snapshots[i - 1]!.effectiveFrom >= ds.snapshots[i]!.effectiveFrom) {
      throw new Error(
        "CourtJurisdictionDataset: snapshots must be in ascending effectiveFrom order",
      );
    }
  }
  return ds;
}

const courtJurisdictionVersionTag = (ds: CourtJurisdictionDataset): string =>
  `court-jurisdiction/v${ds.version}`;

/** 기준일에 시행 중인 판. 날짜가 비었거나 형식이 틀리거나 첫 판보다 이르면 한국어 RangeError. */
export function snapshotAt(
  date: string,
  dataset?: CourtJurisdictionDataset,
): CourtJurisdictionSnapshot {
  if (date.trim() === "") throw new RangeError("기준일을 입력하세요.");
  try {
    parseIsoDateUtc(date);
  } catch {
    throw new RangeError(`기준일 "${date}" 은(는) 올바른 날짜(YYYY-MM-DD)가 아닙니다.`);
  }
  const ds = loadCourtJurisdiction(dataset);
  const hit = ds.snapshots.filter((s) => s.effectiveFrom <= date).at(-1);
  if (hit === undefined) {
    throw new RangeError(
      `기준일 ${date} 은 이 데이터셋의 첫 판 시행일(${ds.snapshots[0]!.effectiveFrom})보다 이릅니다`,
    );
  }
  return hit;
}

/** 기준일 판에 있는 시·도 (데이터셋 순서). */
export function listJurisdictionProvinces(
  date: string,
  dataset?: CourtJurisdictionDataset,
): string[] {
  const ds = loadCourtJurisdiction(dataset);
  const units = snapshotAt(date, ds).units;
  return ds.provinces.filter((p) => units.some((u) => u.province === p));
}

/** 기준일 판에서 그 시·도의 시·군·구 (시·도 전체 칸이 맨 앞). */
export function listJurisdictionUnits(
  date: string,
  province: string,
  dataset?: CourtJurisdictionDataset,
): string[] {
  return snapshotAt(date, dataset)
    .units.filter((u) => u.province === province)
    .map((u) => u.name);
}

function courtsOf(snapshot: CourtJurisdictionSnapshot, province: string, unit: string) {
  const u = snapshot.units.find((x) => x.province === province && x.name === unit);
  if (u === undefined) return null;
  const row = snapshot.rows[u.row];
  if (row === undefined) throw new RangeError(`row ${u.row} missing in ${snapshot.effectiveFrom}`);
  const courts: CourtSet = {
    highCourt: row.highCourt,
    districtCourt: row.districtCourt,
    branch: row.branch,
    municipalCourt: u.municipalCourt,
    rehabilitationCourt: u.rehabilitationCourt,
  };
  return { u, row, courts };
}

const sameCourts = (a: CourtSet, b: CourtSet): boolean =>
  a.highCourt === b.highCourt &&
  a.districtCourt === b.districtCourt &&
  a.branch === b.branch &&
  a.municipalCourt === b.municipalCourt &&
  a.rehabilitationCourt === b.rehabilitationCourt;

/**
 * 시·도 + 시·군·구로 고등법원·지방법원(지원)·시·군법원·회생법원을 찾는다.
 *
 * @throws 기준일 판에 없는 시·도/시·군·구면 RangeError.
 */
export function findCourtJurisdiction(
  input: CourtJurisdictionInput,
  dataset?: CourtJurisdictionDataset,
): CourtJurisdictionResult {
  const ds = loadCourtJurisdiction(dataset);
  const snap = snapshotAt(input.date, ds);
  const hit = courtsOf(snap, input.province, input.unit);
  if (hit === null) {
    throw new RangeError(
      `${input.date} 시행 판 별표에 "${input.province} ${input.unit}" 이(가) 없습니다`,
    );
  }
  const { u, row, courts } = hit;
  const byeolpyo = ["별표 3"];
  if (courts.municipalCourt) byeolpyo.push("별표 7");
  if (courts.rehabilitationCourt) byeolpyo.push("별표 10");
  const upcoming: CourtJurisdictionResult["upcoming"] = [];
  let last = courts;
  for (const later of ds.snapshots.filter((s) => s.effectiveFrom > snap.effectiveFrom)) {
    const next = courtsOf(later, input.province, input.unit);
    if (next === null) {
      upcoming.push({
        effectiveFrom: later.effectiveFrom,
        lawNumber: later.lawNumber,
        courts: null,
      });
      break;
    }
    if (!sameCourts(last, next.courts)) {
      upcoming.push({
        effectiveFrom: later.effectiveFrom,
        lawNumber: later.lawNumber,
        courts: next.courts,
      });
      last = next.courts;
    }
  }
  return {
    ...courts,
    province: u.province,
    unit: u.name,
    effectiveFrom: snap.effectiveFrom,
    lawNumber: snap.lawNumber,
    lawName: ds.law.name,
    areaText: row.areaText,
    note: row.note ?? null,
    statuteName: u.statuteName ?? null,
    correction: snap.correction ?? null,
    byeolpyo,
    upcoming,
    dataVersion: courtJurisdictionVersionTag(ds),
  };
}
