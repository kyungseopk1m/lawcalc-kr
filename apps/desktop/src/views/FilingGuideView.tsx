import { Info } from "lucide-react";
import { useMemo, useState } from "react";

import {
  STANDARD_DISCLAIMER,
  civilFilingsVersionTag,
  criminalFilingsVersionTag,
  loadCivilFilings,
  loadCriminalFilings,
  searchFilings,
  type CivilFilingDocument,
  type CivilStamp,
  type CriminalFilingDocument,
} from "@lawcalc-kr/core-engine";

import { CopyButton } from "../components/ui/copy-button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Notice } from "../components/ui/notice";
import { Input } from "../components/ui/input";
import { useFormShortcuts } from "../hooks/use-form-shortcuts";
import { formatWon } from "../lib/format-won";

const CIVIL = loadCivilFilings();
const CRIMINAL = loadCriminalFilings();

type Kind = "civil" | "criminal";
type Doc = CivilFilingDocument | CriminalFilingDocument;

const TH = "px-3 py-2 text-left font-medium text-muted-foreground";
const TD = "px-3 py-1.5 align-top";

function stampLabel(stamp: CivilStamp): string {
  switch (stamp.kind) {
    case "none":
      return "붙일 인지 없음";
    case "fixed":
      return formatWon(stamp.won);
    case "statute":
      return "법령이 정한 금액 (원문 참조)";
    case "other":
      return "원문 참조";
  }
}

const isCivil = (d: Doc): d is CivilFilingDocument => "stamp" in d;

export function formatFilingForClipboard(kind: Kind, doc: Doc): string {
  const ds = kind === "civil" ? CIVIL : CRIMINAL;
  const lines = [
    `LawCalc Korea ${kind === "civil" ? "민사" : "형사"}서류 안내`,
    `서류: ${doc.name}`,
    `조문: ${doc.article}`,
  ];
  if (isCivil(doc)) {
    lines.push(`인지액: ${doc.stamp.text}`);
    if (doc.stamp.kind !== "none") {
      lines.push(
        `전자소송: ${CIVIL.electronicFiling.text} (${CIVIL.electronicFiling.sourceArticle})`,
      );
    }
  }
  lines.push(
    `전산입력방법: ${doc.entryMethod}`,
    `편철방법: ${doc.filingMethod}`,
    `근거: ${ds.regulation.name} 별표 (${ds.regulation.number}, ${ds.regulation.effectiveFrom} 시행)`,
    "",
    STANDARD_DISCLAIMER,
  );
  return lines.join("\n");
}

function FilingGuideView({ kind, active }: { kind: Kind; active: boolean }) {
  const ds = kind === "civil" ? CIVIL : CRIMINAL;
  const documents: readonly Doc[] = ds.documents;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = useMemo(() => searchFilings(documents, query), [documents, query]);
  const selected = documents.find((d) => d.id === selectedId) ?? null;
  const title = kind === "civil" ? "민사서류 안내" : "형사서류 안내";
  const tag =
    kind === "civil" ? civilFilingsVersionTag(CIVIL) : criminalFilingsVersionTag(CRIMINAL);

  const handleReset = () => {
    setQuery("");
    setSelectedId(null);
  };
  useFormShortcuts({ onReset: handleReset, enabled: active });

  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 content-start items-start gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {ds.regulation.name} 별표 ({ds.regulation.number}, {ds.regulation.effectiveFrom} 시행).
            별표에 없는 서류는 같은 성질이거나 가장 비슷한 서류의 예에 따릅니다 (예규 준용기준).
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0">
          <label className="grid gap-2 text-sm font-medium">
            서류 이름·조문 검색
            <Input
              placeholder={kind === "civil" ? "예: 가압류, 민소 34" : "예: 보석, 형소법 94"}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
            />
          </label>
          <span className="text-xs text-muted-foreground" role="status">
            {rows.length}건 / 전체 {documents.length}건
          </span>
          <div className="max-h-[32rem] overflow-auto rounded-md border border-border">
            <table className="w-full text-sm" data-testid={`filing-table-${kind}`}>
              <thead className="sticky top-0 bg-card">
                <tr>
                  {kind === "criminal" ? <th className={TH}>별표</th> : null}
                  <th className={TH}>서류</th>
                  <th className={TH}>조문</th>
                  {kind === "civil" ? <th className={`${TH} text-right`}>인지액</th> : null}
                  <th className={TH}>편철</th>
                </tr>
              </thead>
              <tbody>
                {/* 패널은 상태를 지키려고 늘 마운트되어 있다. 수백 행을 숨긴 채 그리지 않도록 열렸을 때만 행을 만든다. */}
                {(active ? rows : []).map((d) => (
                  <tr
                    key={d.id}
                    className={`border-t border-border hover:bg-muted/50 ${
                      d.id === selectedId ? "bg-muted" : ""
                    }`}
                  >
                    {!isCivil(d) ? <td className={TD}>{d.table}</td> : null}
                    <td className={TD}>
                      <button
                        type="button"
                        className="text-left underline-offset-2 hover:underline"
                        aria-pressed={d.id === selectedId}
                        onClick={() => {
                          setSelectedId(d.id);
                        }}
                      >
                        {d.name}
                      </button>
                    </td>
                    <td className={TD}>{d.article}</td>
                    {isCivil(d) ? (
                      <td
                        className={`${TD} text-right tabular-nums ${/^[\d,]+원$|^－$/.test(d.stamp.text) ? "whitespace-nowrap" : ""}`}
                      >
                        {d.stamp.text}
                      </td>
                    ) : null}
                    <td className={TD}>{d.filingMethod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">맞는 서류가 없습니다.</p>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            데이터 {tag} · 스냅샷 {ds.snapshotDate} · 출처 {ds.sourceUrl}
          </p>
        </CardContent>
      </Card>

      <div className="result-column grid content-start gap-4">
        {selected ? (
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm" data-testid="filing-selected-name">
                {selected.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 pt-0 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">조문</dt>
                <dd>{selected.article}</dd>
                {isCivil(selected) ? (
                  <>
                    <dt className="text-muted-foreground">인지액</dt>
                    <dd data-testid="filing-stamp">
                      {stampLabel(selected.stamp)}
                      {selected.stamp.kind === "fixed" || selected.stamp.kind === "none" ? null : (
                        <span className="block text-xs text-muted-foreground">
                          원문: {selected.stamp.text}
                        </span>
                      )}
                    </dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">전산입력</dt>
                <dd>{selected.entryMethod}</dd>
                <dt className="text-muted-foreground">편철</dt>
                <dd>{selected.filingMethod}</dd>
              </dl>
              {isCivil(selected) && selected.stamp.kind !== "none" ? (
                <div
                  className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-xs"
                  data-testid="filing-efiling"
                >
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {CIVIL.electronicFiling.text} ({CIVIL.electronicFiling.sourceArticle})
                    {selected.stamp.kind === "statute"
                      ? " 소가에 따른 인지액은 소송비용 탭에서 계산할 수 있습니다."
                      : ""}
                  </span>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton
                  key={`${query}|${selected.id}`}
                  getText={() => formatFilingForClipboard(kind, selected)}
                  okMessage="안내를 클립보드에 복사했습니다."
                />
              </div>
              <Notice tone="info">
                <span>{STANDARD_DISCLAIMER}</span>
              </Notice>
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">
            목록에서 서류를 고르면 자세히 보여 줍니다.
          </p>
        )}
      </div>
    </main>
  );
}

export function CivilFilingGuide({ active = true }: { active?: boolean }) {
  return <FilingGuideView kind="civil" active={active} />;
}

export function CriminalFilingGuide({ active = true }: { active?: boolean }) {
  return <FilingGuideView kind="criminal" active={active} />;
}
