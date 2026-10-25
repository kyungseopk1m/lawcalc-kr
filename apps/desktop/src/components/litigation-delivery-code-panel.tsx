import {
  computeDeliveryFeeForCodeRow,
  getDeliveryUnitPriceAt,
  listDeliveryCodeTable,
  loadDeliveryDataset,
  searchDeliveryCodeTable,
  type CaseType,
} from "@lawcalc-kr/core-engine";
import { useMemo, useState } from "react";

import { formatWon } from "../lib/format-won";
import { parseNumberText } from "../lib/parse-number";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";

const ROWS = listDeliveryCodeTable();

/**
 * 원고·피고 수 칸. `Number()` 로 읽으면 빈칸이 0 명이 되고 "1.5"·전각 숫자가 엔진의 영어
 * 오류로 새므로 본 계산기와 같은 공용 파서로 읽어 한국어 문구를 낸다. 한쪽 0 명은 허용한다.
 */
function readPartyCount(label: string, text: string): { value: number } | { error: string } {
  const parsed = parseNumberText(text, { unit: "명", integer: true, min: 0 });
  if (parsed.error !== undefined) return { error: `${label}: ${parsed.error}` };
  if (parsed.value === undefined) return { error: `${label}: 인원을 입력하세요.` };
  return { value: parsed.value };
}

/**
 * 송달료 사건부호표 보조 패널. 「송달료규칙의 시행에 따른 업무처리요령」(재일 87-4) 별표 1.
 *
 * 부호·사건명으로 행을 찾아 당사자 1인당 회수와 송달료를 보여 준다. 1회 단가는 본 계산기의
 * 접수일 기준 단가를 쓴다. 사건구분과 1:1 로 대응하는 행만 본 계산기에 적용할 수 있다.
 * 이 패널의 입력은 .lcalc 에 저장하지 않는다.
 */
export function DeliveryCodePanel({
  filingDate,
  onApply,
}: {
  filingDate: string;
  onApply: (next: { caseType: CaseType; partyCount?: number }) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [plaintiffText, setPlaintiffText] = useState("1");
  const [defendantText, setDefendantText] = useState("1");

  const matches = useMemo(() => {
    const found = new Set(searchDeliveryCodeTable(query));
    return ROWS.flatMap((row, index) => (found.has(row) ? [{ row, index }] : []));
  }, [query]);
  const current = matches.find((m) => m.index === selected) ?? matches[0];
  const row = current?.row;
  const plaintiff = useMemo(
    () => readPartyCount("원고(신청인) 수", plaintiffText),
    [plaintiffText],
  );
  const defendant = useMemo(
    () => readPartyCount("피고(상대방) 수", defendantText),
    [defendantText],
  );
  const partyCount =
    "value" in plaintiff && "value" in defendant ? plaintiff.value + defendant.value : NaN;

  const fee = useMemo(() => {
    if (row?.countPerParty === undefined) return null;
    if ("error" in plaintiff) return plaintiff;
    if ("error" in defendant) return defendant;
    try {
      const unitPrice = getDeliveryUnitPriceAt(
        loadDeliveryDataset(),
        filingDate || undefined,
      ).unitPriceWon;
      return computeDeliveryFeeForCodeRow(
        row,
        { plaintiffCount: plaintiff.value, defendantCount: defendant.value },
        unitPrice,
      );
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [defendant, filingDate, plaintiff, row]);

  return (
    <details className="rounded-md border border-border bg-muted/40 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        송달료 사건부호표 (재일 87-4 별표 1)
      </summary>
      <div className="grid gap-3 pt-3">
        <label className="grid gap-2 text-sm font-medium">
          사건명·부호 검색
          <Input
            value={query}
            placeholder="예: 가합, 타채, 가압류"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {row ? (
          <>
            <label className="grid gap-2 text-sm font-medium">
              적용대상사건
              <Select
                value={String(current.index)}
                onChange={(e) => setSelected(Number(e.target.value))}
              >
                {matches.map(({ row: r, index }) => (
                  <option key={index} value={index}>
                    [{r.category}] {r.labelKo}
                  </option>
                ))}
              </Select>
            </label>
            <p className="text-xs text-muted-foreground">
              당사자 1인당 {row.countText} · 수송달자: {row.recipientsKo}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                원고(신청인) 수
                <Input
                  value={plaintiffText}
                  inputMode="numeric"
                  onChange={(e) => setPlaintiffText(e.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                피고(상대방) 수
                <Input
                  value={defendantText}
                  inputMode="numeric"
                  onChange={(e) => setDefendantText(e.target.value)}
                />
              </label>
            </div>
            {row.codes.some((c) => c === "타채" || c === "타기") ? (
              <p className="text-xs text-amber-900 dark:text-amber-200">
                제3채무자도 송달받는 당사자이므로 당사자 수에 넣으세요. 송달할 필요가 없으면 납부
                대상에서 빠집니다.
              </p>
            ) : null}
            {fee === null ? (
              <p className="text-xs text-muted-foreground">
                이 행은 회수가 당사자 수만으로 정해지지 않아 여기서 금액을 내지 않습니다.
                {row.caseType ? " 사건구분을 적용한 뒤 이 계산기에서 계산하세요." : ""}
              </p>
            ) : "error" in fee ? (
              <p className="text-xs text-destructive">{fee.error}</p>
            ) : (
              <div className="grid gap-2 rounded-md border border-border bg-background p-3">
                <p className="text-sm">
                  송달료 <strong>{formatWon(fee.amount)}</strong> ({fee.deliveryCount}회)
                </p>
                <p className="text-xs text-muted-foreground">{fee.formulaText}</p>
              </div>
            )}
            {row.caseType ? (
              <Button
                type="button"
                variant="outline"
                disabled={
                  row.countPerParty !== undefined &&
                  !(Number.isInteger(partyCount) && partyCount >= 1)
                }
                onClick={() =>
                  onApply({
                    caseType: row.caseType!,
                    ...(row.countPerParty !== undefined ? { partyCount } : {}),
                  })
                }
              >
                {row.countPerParty !== undefined ? "사건구분·당사자수 적용" : "사건구분 적용"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                이 행에 맞는 사건구분이 이 계산기에 없어 적용할 수 없습니다.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">검색 결과가 없습니다.</p>
        )}
      </div>
    </details>
  );
}
