import { useMemo, useState } from "react";

import {
  computeStaleBadge,
  LABOR_RATES_CADENCE,
  laborRatesDatasetVersionTag,
  LIFE_EXPECTANCY_CADENCE,
  lifeExpectancyDatasetVersionTag,
  loadLaborRatesTable,
  loadLifeExpectancyTable,
  type PublicationCadence,
} from "@lawcalc-kr/datasets-compensation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Notice } from "../components/ui/notice";
import { Select } from "../components/ui/select";
import { todayIso } from "../lib/today";

const LIFE = loadLifeExpectancyTable();
const LABOR = loadLaborRatesTable();
const MAX_ROWS = 300;
const won = new Intl.NumberFormat("ko-KR");

function Meta({
  tag,
  dataset,
  cadence,
  testId,
}: {
  tag: string;
  dataset: { source: string; sourceUrl: string; snapshotDate: string; license: string };
  cadence: PublicationCadence;
  testId: string;
}) {
  // 참고표는 계산에 쓰지 않는 열람 화면이라 경과와 상관없이 회색 한 줄만 둔다.
  const { monthsElapsed } = useMemo(
    () => computeStaleBadge(dataset.snapshotDate, todayIso(), cadence),
    [dataset.snapshotDate, cadence],
  );
  return (
    <div className="space-y-2 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">버전</dt>
        <dd>{tag}</dd>
        <dt className="text-muted-foreground">출처</dt>
        <dd>{dataset.source}</dd>
        <dt className="text-muted-foreground">출처 URL</dt>
        <dd className="break-all">{dataset.sourceUrl}</dd>
        <dt className="text-muted-foreground">스냅샷 일자</dt>
        <dd>{dataset.snapshotDate}</dd>
        <dt className="text-muted-foreground">라이선스</dt>
        <dd>{dataset.license}</dd>
      </dl>
      <Notice tone="info" testId={testId}>
        <span>
          스냅샷 {dataset.snapshotDate} · 경과 {monthsElapsed}개월
        </span>
      </Notice>
    </div>
  );
}

const TH = "px-3 py-2 text-left font-medium text-muted-foreground";
const TD = "px-3 py-1.5";

function LifeExpectancyPanel() {
  const [year, setYear] = useState(LIFE.years[0]?.mortalityBaseYear ?? 0);
  const [sex, setSex] = useState<"male" | "female">("male");
  const [ageFilter, setAgeFilter] = useState("");
  const rows = useMemo(() => {
    const table = LIFE.years.find((y) => y.mortalityBaseYear === year);
    if (!table) return [];
    const q = ageFilter.trim();
    return table[sex]
      .map((remainingYears, i) => ({ age: table.ageFrom + i, remainingYears }))
      .filter((r) => q === "" || String(r.age).startsWith(q));
  }, [year, sex, ageFilter]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>여명표</CardTitle>
        <CardDescription>기대여명(잔여 연수). 계산기가 쓰는 번들 데이터입니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span>표 기준연도</span>
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {LIFE.years.map((y) => (
                <option key={y.mortalityBaseYear} value={y.mortalityBaseYear}>
                  {y.mortalityBaseYear}년
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span>성별</span>
            <Select value={sex} onChange={(e) => setSex(e.target.value as "male" | "female")}>
              <option value="male">남</option>
              <option value="female">여</option>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span>나이 검색</span>
            <Input
              inputMode="numeric"
              placeholder="예: 3 (3으로 시작하는 나이)"
              value={ageFilter}
              onChange={(e) => setAgeFilter(e.target.value)}
            />
          </label>
        </div>
        <div className="max-h-96 max-w-sm overflow-auto rounded-md border border-border">
          <table className="w-full text-sm" data-testid="life-table">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th className={`${TH} text-right`}>나이(세)</th>
                <th className={`${TH} text-right`}>잔여 연수</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, MAX_ROWS).map((r) => (
                <tr key={r.age} className="border-t border-border">
                  <td className={`${TD} num`}>{r.age}</td>
                  <td className={`${TD} num`}>{r.remainingYears}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Meta
          tag={lifeExpectancyDatasetVersionTag(LIFE)}
          dataset={LIFE}
          cadence={LIFE_EXPECTANCY_CADENCE}
          testId="reference-life-stale-badge"
        />
      </CardContent>
    </Card>
  );
}

function LaborRatesPanel() {
  // slices 순서에 의존하지 않도록 최신순으로 정렬한다.
  const slices = useMemo(
    () => [...LABOR.slices].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    [],
  );
  const [from, setFrom] = useState<string>(slices[0]?.effectiveFrom ?? "");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const slice = slices.find((s) => s.effectiveFrom === from);
    if (!slice) return [];
    const q = query.trim();
    return Object.entries(slice.rates).filter(([name]) => q === "" || name.includes(q));
  }, [slices, from, query]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>노임표</CardTitle>
        <CardDescription>
          조사 시기별 직종 일당(원). 계산기가 쓰는 번들 데이터입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>조사 시기</span>
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              {slices.map((s) => (
                <option key={s.effectiveFrom} value={s.effectiveFrom}>
                  {s.year}년 {s.half === 1 ? "상반기" : "하반기"} (적용 {s.effectiveFrom})
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span>직종명 검색</span>
            <Input
              placeholder="예: 보통인부"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="max-h-96 overflow-auto rounded-md border border-border">
          <table className="w-full text-sm" data-testid="labor-table">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th className={TH}>직종</th>
                <th className={`${TH} text-right`}>일당(원)</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, MAX_ROWS).map(([name, rate]) => (
                <tr key={name} className="border-t border-border">
                  <td className={TD}>{name}</td>
                  <td className={`${TD} num`}>{won.format(rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          {rows.length}개 직종{rows.length > MAX_ROWS ? ` 중 앞 ${MAX_ROWS}개 표시` : ""}
        </p>
        <Meta
          tag={laborRatesDatasetVersionTag(LABOR)}
          dataset={LABOR}
          cadence={LABOR_RATES_CADENCE}
          testId="reference-labor-stale-badge"
        />
      </CardContent>
    </Card>
  );
}

/** 다른 도구처럼 늘 마운트해 두고 App 이 `hidden` 으로 숨긴다. 하위 탭을 오가도 검색어가 남는다. */
export function ReferenceTablesView() {
  return (
    <main
      className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-4 sm:px-6"
      data-testid="reference-tables-view"
    >
      <LifeExpectancyPanel />
      <LaborRatesPanel />
    </main>
  );
}
