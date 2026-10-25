import { CheckCircle2, Clipboard, Info, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import {
  STANDARD_DISCLAIMER,
  findCourtJurisdiction,
  listJurisdictionProvinces,
  listJurisdictionUnits,
  loadCourtJurisdiction,
  type CourtJurisdictionResult,
  type CourtSet,
} from "@lawcalc-kr/core-engine";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { useFormShortcuts } from "../hooks/use-form-shortcuts";
import { ipc } from "../lib/ipc";
import { todayIso } from "../lib/today";

const DATASET = loadCourtJurisdiction();

const COURT_LABELS: Array<[keyof CourtSet, string]> = [
  ["highCourt", "고등법원"],
  ["districtCourt", "지방법원"],
  ["branch", "지원"],
  ["municipalCourt", "시·군법원"],
  ["rehabilitationCourt", "회생법원"],
];

const courtText = (c: CourtSet, key: keyof CourtSet): string =>
  c[key] ?? (key === "branch" ? "없음 (본원 관할)" : "별표에 해당 없음");

export function formatJurisdictionForClipboard(r: CourtJurisdictionResult, date: string): string {
  const lines = [
    "LawCalc Korea 관할법원 찾기",
    `기준일: ${date}`,
    `지역: ${r.province} ${r.unit}`,
    ...COURT_LABELS.map(([key, label]) => `${label}: ${courtText(r, key)}`),
  ];
  if (r.note) lines.push(`별표 3 단서: ${r.note}`);
  for (const u of r.upcoming) {
    lines.push(
      u.courts
        ? `${u.effectiveFrom} 시행 예정 변경: ${COURT_LABELS.map(([k, l]) => `${l} ${courtText(u.courts!, k)}`).join(", ")}`
        : `${u.effectiveFrom} 시행 판부터는 이 지역이 더 잘게 나뉘어 있어 다시 찾아야 합니다.`,
    );
  }
  lines.push(
    `근거: ${r.lawName} ${r.byeolpyo.join("·")} (${r.lawNumber}, ${r.effectiveFrom} 시행 판)`,
    "",
    STANDARD_DISCLAIMER,
  );
  return lines.join("\n");
}

export function CourtJurisdictionView({ active = true }: { active?: boolean }) {
  const [date, setDate] = useState(todayIso);
  const [province, setProvince] = useState("");
  const [unit, setUnit] = useState("");
  const [copyStatus, setCopyStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const { provinces, units, error } = useMemo((): {
    provinces: string[];
    units: string[];
    error: string | null;
  } => {
    try {
      const ps = listJurisdictionProvinces(date);
      return {
        provinces: ps,
        units: province ? listJurisdictionUnits(date, province) : [],
        error: null,
      };
    } catch (e) {
      return { provinces: [], units: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [date, province]);

  // 기준일을 옮겨 고른 칸이 새 판 별표에 없으면 결과를 조용히 지우지 않고 알린다.
  const missingUnit = error === null && province !== "" && unit !== "" && !units.includes(unit);

  const result = useMemo(() => {
    if (!province || !unit || !units.includes(unit)) return null;
    return findCourtJurisdiction({ province, unit, date });
  }, [province, unit, units, date]);

  const handleReset = () => {
    setDate(todayIso());
    setProvince("");
    setUnit("");
    setCopyStatus(null);
  };
  useFormShortcuts({ onReset: handleReset, enabled: active });

  const handleCopy = async () => {
    if (!result) return;
    try {
      await ipc.copyToClipboard(formatJurisdictionForClipboard(result, date));
      setCopyStatus({ ok: true, message: "결과를 클립보드에 복사했습니다." });
    } catch (e) {
      setCopyStatus({ ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[420px_minmax(0,1fr)]">
      <Card className="content-start">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">관할법원 찾기</CardTitle>
          <p className="text-xs text-muted-foreground">
            {DATASET.law.name} 별표 3(고등법원·지방법원과 지원), 별표 7(시·군법원), 별표
            10(회생법원)으로 찾습니다. 가정법원(별표 5)은 아직 담지 않았습니다.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0">
          <label className="grid gap-2 text-sm font-medium">
            기준일
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setCopyStatus(null);
              }}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            시·도
            <Select
              value={province}
              onChange={(e) => {
                setProvince(e.target.value);
                setUnit("");
                setCopyStatus(null);
              }}
            >
              <option value="">선택</option>
              {provinces.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            시·군·구
            <Select
              value={unit}
              disabled={units.length === 0}
              onChange={(e) => {
                setUnit(e.target.value);
                setCopyStatus(null);
              }}
            >
              <option value="">선택</option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u === DATASET.wholeUnitName ? `${province} 전체` : u}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex gap-2">
            <Button onClick={handleReset} variant="outline" type="button">
              초기화
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            데이터 court-jurisdiction/v{DATASET.version} · 스냅샷 {DATASET.snapshotDate} · 담긴 판{" "}
            {DATASET.snapshots.map((s) => s.effectiveFrom).join(", ")}
          </p>
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        {error ? (
          <div
            className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
            role="alert"
          >
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {missingUnit ? (
          <div
            className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
            role="status"
            data-testid="jurisdiction-missing-unit"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {date} 시행 판 별표에는 "{province} {unit === DATASET.wholeUnitName ? "전체" : unit}"
              칸이 없습니다. 이 판에서는 지역이 달리 나뉘어 있으니 시·군·구를 다시 고르세요.
            </span>
          </div>
        ) : null}

        {result ? (
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">
                {result.province} {result.unit === DATASET.wholeUnitName ? "전체" : result.unit}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {result.lawNumber}, {result.effectiveFrom} 시행 판 · {result.byeolpyo.join("·")}
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 pt-0 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {COURT_LABELS.map(([key, label]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd data-testid={`jurisdiction-${key}`}>{courtText(result, key)}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground">
                별표 3 관할구역 원문: {result.areaText}
              </p>
              {result.note ? (
                <p className="text-xs" data-testid="jurisdiction-note">
                  별표 3 단서: {result.note}
                </p>
              ) : null}
              {result.statuteName ? (
                <p className="text-xs text-muted-foreground">
                  별표는 이 지역을 "{result.statuteName}" 로 적고 있습니다 (행정구역 변경 전 표기).
                </p>
              ) : null}
              {result.correction ? (
                <p className="text-xs text-muted-foreground">보정: {result.correction}</p>
              ) : null}
              {result.upcoming.map((u) => (
                <div
                  key={u.effectiveFrom}
                  className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                  data-testid="jurisdiction-upcoming"
                >
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {u.courts
                      ? `${u.effectiveFrom} 시행(${u.lawNumber})부터: ${COURT_LABELS.map(([k, l]) => `${l} ${courtText(u.courts!, k)}`).join(", ")}`
                      : `${u.effectiveFrom} 시행 판부터는 이 지역이 더 잘게 나뉘어 있습니다. 기준일을 바꿔 다시 찾으세요.`}
                  </span>
                </div>
              ))}
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
                {copyStatus ? (
                  <span
                    role="status"
                    className={`text-xs ${copyStatus.ok ? "text-muted-foreground" : "text-red-700 dark:text-red-200"}`}
                  >
                    {copyStatus.message}
                  </span>
                ) : null}
              </div>
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
