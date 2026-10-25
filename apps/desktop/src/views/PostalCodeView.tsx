import { CheckCircle2, Clipboard, Info, Scale } from "lucide-react";
import { useMemo, useState } from "react";

import {
  STANDARD_DISCLAIMER,
  findCourtJurisdiction,
  formatPostalCodes,
  listJurisdictionUnits,
  loadCourtJurisdiction,
  loadPostalCodes,
  postalRegionToJurisdiction,
  searchPostalCodes,
  type CourtJurisdictionResult,
  type PostalRegion,
} from "@lawcalc-kr/core-engine";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { useFormShortcuts } from "../hooks/use-form-shortcuts";
import { ipc } from "../lib/ipc";
import { todayIso } from "../lib/today";

const DATASET = loadPostalCodes();
const JURISDICTION = loadCourtJurisdiction();
const CAVEAT =
  "건물 단위가 아닌 읍면동 요약입니다. 한 읍·면·동에 우편번호가 여럿이면 실제 번호는 도로명·건물번호에 따라 다르니 우편 발송 전 우정사업본부 우편번호 검색으로 확인하세요.";

const regionName = (r: PostalRegion): string =>
  [r.sido, r.sigungu, r.emd, r.ri ?? ""].filter((s) => s !== "").join(" ");
const regionKey = (r: PostalRegion): string => `${r.sido}|${r.sigungu}|${r.emd}|${r.ri ?? ""}`;

/** 관할법원 찾기 칸으로 옮겨 찾는다. 칸이 없거나 데이터 범위 밖이면 null. */
function jurisdictionFor(r: PostalRegion, date: string): CourtJurisdictionResult | null {
  try {
    const target = postalRegionToJurisdiction(
      r,
      (p) => listJurisdictionUnits(date, p),
      JURISDICTION.wholeUnitName,
    );
    return target ? findCourtJurisdiction({ ...target, date }) : null;
  } catch {
    return null;
  }
}

const unitLabel = (j: CourtJurisdictionResult): string =>
  `${j.province} ${j.unit === JURISDICTION.wholeUnitName ? "전체" : j.unit}`;

export function formatPostalForClipboard(r: PostalRegion): string {
  return [
    "LawCalc Korea 우편번호 찾기",
    `지역: ${regionName(r)}`,
    `우편번호: ${formatPostalCodes(r.codes)}`,
    CAVEAT,
    `출처: 우정사업본부 우편번호 DB (${DATASET.baseDate} 기준, ${DATASET.noticeDate} 고시) · 데이터 postal-codes/v${DATASET.version}`,
    "",
    STANDARD_DISCLAIMER,
  ].join("\n");
}

export function PostalCodeView({ active = true }: { active?: boolean }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [showCourt, setShowCourt] = useState(false);
  const [copyStatus, setCopyStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const result = useMemo(() => searchPostalCodes(query), [query]);
  const picked = result.hits.find((r) => regionKey(r) === selected) ?? null;
  const today = todayIso();
  const court = useMemo(
    () => (picked && showCourt ? jurisdictionFor(picked, today) : null),
    [picked, showCourt, today],
  );

  const handleReset = () => {
    setQuery("");
    setSelected(null);
    setShowCourt(false);
    setCopyStatus(null);
  };
  useFormShortcuts({ onReset: handleReset, enabled: active });

  const handleCopy = async () => {
    if (!picked) return;
    try {
      await ipc.copyToClipboard(formatPostalForClipboard(picked));
      setCopyStatus({ ok: true, message: "결과를 클립보드에 복사했습니다." });
    } catch (e) {
      setCopyStatus({ ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[420px_minmax(0,1fr)]">
      <Card className="content-start">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">우편번호 찾기</CardTitle>
          <p className="text-xs text-muted-foreground">
            시·도, 시·군·구, 읍·면·동(행정동 포함), 리 이름이나 5자리 우편번호(앞자리만도 됨)로
            찾습니다. 여러 낱말은 띄어 쓰면 모두 들어 있는 지역만 나옵니다. 리로 찾으면 원본에서 그
            리 건물에 나오는 번호만 보입니다.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0">
          <label className="grid gap-2 text-sm font-medium">
            지역 또는 우편번호
            <Input
              value={query}
              placeholder="예: 강남구 역삼동, 금호동, 모전리, 06236"
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
                setShowCourt(false);
                setCopyStatus(null);
              }}
            />
          </label>
          <div className="flex gap-2">
            <Button onClick={handleReset} variant="outline" type="button">
              초기화
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{CAVEAT}</span>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="postal-snapshot">
            데이터 postal-codes/v{DATASET.version} · 우정사업본부 우편번호 DB {DATASET.baseDate}{" "}
            기준({DATASET.noticeDate} 고시) · 스냅샷 {DATASET.snapshotDate} · 읍·면·동{" "}
            {DATASET.counts.emd.toLocaleString("ko-KR")}곳, 리{" "}
            {DATASET.counts.ri.toLocaleString("ko-KR")}곳, 우편번호{" "}
            {DATASET.counts.codes.toLocaleString("ko-KR")}개
          </p>
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        {result.mode !== null ? (
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm" data-testid="postal-count">
                {result.total === 0
                  ? "찾은 지역이 없습니다"
                  : `${result.total.toLocaleString("ko-KR")}곳${
                      result.total > result.hits.length
                        ? ` (앞 ${result.hits.length}곳만 표시, 낱말을 더 넣어 좁히세요)`
                        : ""
                    }`}
              </CardTitle>
            </CardHeader>
            {result.hits.length > 0 ? (
              <CardContent className="max-h-80 overflow-y-auto p-4 pt-0">
                <ul className="grid gap-1 text-sm">
                  {result.hits.map((r) => {
                    const key = regionKey(r);
                    const on = key === selected;
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          aria-pressed={on}
                          className={`grid w-full gap-0.5 rounded-md px-2 py-1 text-left hover:bg-muted ${
                            on ? "bg-muted font-semibold" : ""
                          }`}
                          onClick={() => {
                            setSelected(key);
                            setShowCourt(false);
                            setCopyStatus(null);
                          }}
                        >
                          <span>{regionName(r)}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatPostalCodes(r.codes)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            ) : null}
          </Card>
        ) : null}

        {picked ? (
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">{regionName(picked)}</CardTitle>
              {picked.adminDongs ? (
                <p className="text-xs text-muted-foreground">
                  행정동: {picked.adminDongs.join(", ")}
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-3 p-4 pt-0 text-sm">
              <p data-testid="postal-codes">{formatPostalCodes(picked.codes)}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void handleCopy();
                  }}
                >
                  <Clipboard className="h-4 w-4" aria-hidden="true" />
                  복사
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-expanded={showCourt}
                  onClick={() => setShowCourt((v) => !v)}
                >
                  <Scale className="h-4 w-4" aria-hidden="true" />
                  관할법원 보기
                </Button>
                {copyStatus ? (
                  <span
                    role="status"
                    className={`text-xs ${copyStatus.ok ? "text-muted-foreground" : "text-red-700 dark:text-red-200"}`}
                  >
                    {copyStatus.message}
                  </span>
                ) : null}
              </div>
              {showCourt ? (
                <div
                  className="grid gap-1 rounded-md border px-3 py-2 text-xs"
                  data-testid="postal-court"
                >
                  {court ? (
                    <>
                      <span>
                        {court.branch ?? court.districtCourt} ({court.highCourt} 관내)
                        {court.municipalCourt ? ` · 시·군법원 ${court.municipalCourt}` : ""}
                      </span>
                      <span className="text-muted-foreground">
                        오늘({today}) 시행 판 {court.lawName} {court.byeolpyo.join("·")} 의 "
                        {unitLabel(court)}" 칸입니다. 시행 예정 변경과 단서는 도구 탭 "관할법원
                        찾기" 에서 확인하세요.
                      </span>
                    </>
                  ) : (
                    <span>
                      이 지역은 관할법원 데이터의 시·군·구 칸과 바로 맞지 않습니다. 도구 탭
                      "관할법원 찾기" 에서 직접 고르세요.
                    </span>
                  )}
                </div>
              ) : null}
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{STANDARD_DISCLAIMER}</span>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
