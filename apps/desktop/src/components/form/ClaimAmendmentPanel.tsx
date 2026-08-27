import {
  computeClaimAmendmentStampDuty,
  type CaseType,
  type ClaimAmendmentResult,
} from "@lawcalc-kr/core-engine";
import { useMemo, useState } from "react";

import { formatWon, formatWonInput, parseWonText } from "../../lib/format-won";
import { Input } from "../ui/input";
import { Select } from "../ui/select";

/**
 * 청구취지 확장(청구변경신청) 인지액 보조 패널. 「민사소송 등 인지법」 제5조.
 *
 * 사건구분·접수일·전자소송 여부는 본 계산기의 현재 입력을 그대로 쓴다. 심급은 제5조 고지가
 * 제1심·제2심만 정하므로 이 패널 안에서 따로 고른다 (본 계산기의 심급은 상고를 포함한다).
 */
export function ClaimAmendmentPanel({
  caseType,
  isElectronicFiling,
  filingDate,
}: {
  caseType: CaseType;
  isElectronicFiling: boolean;
  filingDate: string;
}) {
  const [level, setLevel] = useState<"firstInstance" | "appeal">("firstInstance");
  const [beforeText, setBeforeText] = useState("");
  const [afterText, setAfterText] = useState("");
  const [beforePaidText, setBeforePaidText] = useState("");

  const result = useMemo<ClaimAmendmentResult | { error: string }>(() => {
    try {
      const beforePaid = parseWonText(beforePaidText);
      return computeClaimAmendmentStampDuty({
        caseType,
        appealsLevel: level,
        beforeCaseValue: Number(parseWonText(beforeText) || "0"),
        afterCaseValue: Number(parseWonText(afterText) || "0"),
        ...(beforePaid ? { beforeStampDutyWon: Number(beforePaid) } : {}),
        ...(isElectronicFiling ? { isElectronicFiling: true } : {}),
        ...(filingDate ? { filingDate } : {}),
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [afterText, beforePaidText, beforeText, caseType, filingDate, isElectronicFiling, level]);

  const failed = "error" in result;

  return (
    <details className="rounded-md border border-border bg-muted/40 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        청구변경신청 인지액 (인지법 제5조)
      </summary>
      <div className="grid gap-3 pt-3">
        <p className="text-xs text-muted-foreground">
          청구취지를 확장할 때 추가로 붙일 인지액입니다. 변경 전·후 인지액을 종이소송 기준으로 각각
          계산한 뒤, 차액에 전자소송 감액을 한 번만 적용합니다.
        </p>
        <label className="grid gap-2 text-sm font-medium">
          청구변경 심급
          <Select
            value={level}
            onChange={(e) => setLevel(e.target.value as "firstInstance" | "appeal")}
          >
            <option value="firstInstance">제1심</option>
            <option value="appeal">제2심 (변경 후 인지액 × 1.5)</option>
          </Select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            변경 전 소가
            <Input
              value={formatWonInput(beforeText)}
              inputMode="numeric"
              onChange={(e) => setBeforeText(parseWonText(e.target.value))}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            변경 후 소가
            <Input
              value={formatWonInput(afterText)}
              inputMode="numeric"
              onChange={(e) => setAfterText(parseWonText(e.target.value))}
            />
          </label>
        </div>
        <label className="grid gap-2 text-sm font-medium">
          변경 전 실제 납부 인지액
          <Input
            value={formatWonInput(beforePaidText)}
            inputMode="numeric"
            placeholder="비워 두면 변경 전 소가에서 산출"
            onChange={(e) => setBeforePaidText(parseWonText(e.target.value))}
          />
          <span className="text-xs font-normal text-muted-foreground">
            제5조는 &ldquo;변경 전의 청구에 관한 인지액&rdquo;을 뺀다고 정합니다. 실제 납부액이 소가
            역산값과 다르면 여기에 넣으세요.
          </span>
        </label>
        {failed ? (
          <p className="text-xs text-destructive">{result.error}</p>
        ) : (
          <div className="grid gap-2 rounded-md border border-border bg-background p-3">
            <p className="text-sm">
              추가 납부 인지액 <strong>{formatWon(result.amount)}</strong>
            </p>
            <p className="text-xs text-muted-foreground">{result.formulaText}</p>
          </div>
        )}
      </div>
    </details>
  );
}
