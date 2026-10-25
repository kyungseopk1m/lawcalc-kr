import {
  computeCostAssessment,
  loadLawyerFeeDataset,
  STANDARD_DISCLAIMER,
  type AppealsLevel,
  type CaseType,
  type CostAssessmentAmountSource,
  type CostAssessmentHalfReason,
  type CostAssessmentInput,
  type CostAssessmentParty,
  type CostAssessmentPartyCosts,
  type CostAssessmentPartyCostsInput,
  type CostAssessmentResult,
  type LawyerFeeRuleVersionKey,
} from "@lawcalc-kr/core-engine";
import { Clipboard, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { formatWon, formatWonInput, parseWonText } from "../lib/format-won";
import { ipc } from "../lib/ipc";
import { todayIso } from "../lib/today";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";

/**
 * 소송비용확정 패널 (민사소송법 제110조~제112조, 「변호사보수의 소송비용 산입에 관한 규칙」 연혁 7개 판).
 * 본 계산기 입력과 따로 움직이며 .lcalc 에 저장하지 않는다.
 */

type SourceMode = "auto" | "manual" | "none";

interface PartyDraft {
  stampMode: SourceMode;
  stampText: string;
  deliveryMode: SourceMode;
  deliveryText: string;
  lawyer: boolean;
  paidText: string;
  otherText: string;
}

interface InstanceDraft {
  id: number;
  level: AppealsLevel;
  caseType: CaseType;
  filingDate: string;
  caseValueText: string;
  partyCountText: string;
  version: LawyerFeeRuleVersionKey | "";
  halfReason: CostAssessmentHalfReason;
  plaintiff: PartyDraft;
  defendant: PartyDraft;
}

const LEVEL_LABEL: Record<AppealsLevel, string> = {
  firstInstance: "1심",
  appeal: "항소심",
  supreme: "상고심",
};
const LEVEL_CASE_TYPE: Record<AppealsLevel, CaseType> = {
  firstInstance: "civilFirstInstanceSingle",
  appeal: "civilAppeal",
  supreme: "civilSupremeAppeal",
};
const PARTY_LABEL: Record<CostAssessmentParty, string> = { plaintiff: "원고", defendant: "피고" };
const HALF_OPTIONS: Array<[CostAssessmentHalfReason, string]> = [
  ["none", "없음"],
  ["admissionJudgment", "전부자백·자백간주 판결 (제5조)"],
  ["noOralHearingJudgment", "무변론 판결 (제5조, 2003판부터)"],
  ["orderForPerformance", "이행권고결정 (제5조, 2020판부터)"],
  ["nonJudgmentEnding", "화해·포기·인낙 등 (제5조, 1981·1990판)"],
  ["provisional", "가압류·가처분 (제3조 제2항, 1990판부터)"],
];
const RULE_VERSIONS = loadLawyerFeeDataset().ruleVersions;

const party = (filer: boolean): PartyDraft => ({
  stampMode: filer ? "auto" : "none",
  stampText: "",
  deliveryMode: filer ? "auto" : "none",
  deliveryText: "",
  lawyer: true,
  paidText: "",
  otherText: "",
});

function newInstance(id: number, level: AppealsLevel): InstanceDraft {
  return {
    id,
    level,
    caseType: LEVEL_CASE_TYPE[level],
    filingDate: todayIso(),
    caseValueText: "",
    partyCountText: "2",
    version: "",
    halfReason: "none",
    plaintiff: party(level === "firstInstance"),
    defendant: party(false),
  };
}

function source(mode: SourceMode, text: string): CostAssessmentAmountSource {
  if (mode === "auto") return { mode: "auto" };
  const digits = parseWonText(text);
  return { mode: "manual", amountWon: mode === "none" || digits === "" ? 0 : Number(digits) };
}

function partyInput(d: PartyDraft): CostAssessmentPartyCostsInput {
  const paid = parseWonText(d.paidText);
  const other = parseWonText(d.otherText);
  return {
    stampDuty: source(d.stampMode, d.stampText),
    deliveryFee: source(d.deliveryMode, d.deliveryText),
    lawyerRetained: d.lawyer,
    ...(paid === "" ? {} : { paidLawyerFeeWon: Number(paid) }),
    ...(other === "" ? {} : { otherCostsWon: Number(other) }),
  };
}

export function buildCostAssessmentInput(state: {
  instances: InstanceDraft[];
  burdenPlaintiffText: string;
  burdenDefendantText: string;
  applicant: CostAssessmentParty;
  opponentSubmitted: boolean;
}): CostAssessmentInput | string {
  for (const [i, d] of state.instances.entries()) {
    if (parseWonText(d.caseValueText) === "") return `${i + 1}번째 심급의 소가를 입력하세요.`;
  }
  const p = parseWonText(state.burdenPlaintiffText);
  const q = parseWonText(state.burdenDefendantText);
  if (p === "" || q === "") return "부담 비율을 입력하세요.";
  return {
    instances: state.instances.map((d) => ({
      level: d.level,
      caseType: d.caseType,
      filingDate: d.filingDate,
      caseValue: Number(parseWonText(d.caseValueText)),
      partyCount: Number(parseWonText(d.partyCountText) || "2"),
      halfReason: d.halfReason,
      ...(d.version === "" ? {} : { ruleVersionOverride: d.version }),
      plaintiff: partyInput(d.plaintiff),
      defendant: partyInput(d.defendant),
    })),
    burden: { plaintiff: Number(p), defendant: Number(q) },
    applicant: state.applicant,
    opponentSubmitted: state.opponentSubmitted,
  };
}

function partyLine(label: string, c: CostAssessmentPartyCosts): string {
  return (
    `  ${label}: 인지 ${formatWon(c.stampDutyWon)} · 송달료 ${formatWon(c.deliveryFeeWon)} · ` +
    `변호사보수 ${formatWon(c.lawyerFeeWon)} · 기타 ${formatWon(c.otherCostsWon)} = ${formatWon(c.subtotalWon)}`
  );
}

/** 클립보드 본문. 끝은 항상 STANDARD_DISCLAIMER. */
export function formatCostAssessmentForClipboard(result: CostAssessmentResult): string {
  const lines = ["[소송비용확정]"];
  result.instances.forEach((r, i) => {
    lines.push(
      `${i + 1}. ${LEVEL_LABEL[r.level]} (접수 ${r.filingDate}, 소가 ${formatWon(r.caseValue)})`,
      `  변호사보수 산정: ${r.lawyerFee.formulaText}`,
      partyLine("원고", r.plaintiff),
      partyLine("피고", r.defendant),
    );
  });
  lines.push(
    `비용 합계: 원고 ${formatWon(result.totals.plaintiff)} · 피고 ${formatWon(result.totals.defendant)}`,
    `신청인 청구: ${result.applicantClaim.formulaText}`,
  );
  if (result.opponentClaim) lines.push(`상대방 청구: ${result.opponentClaim.formulaText}`);
  lines.push(`결과: ${result.net.formulaText}`);
  for (const w of result.warnings) lines.push(`주의: ${w}`);
  lines.push(
    "최저액을 먼저 적용한 뒤 1/2로 나누는 순서는 규칙 문언에 따른 것이며 판례로 확인하지 않았습니다.",
    STANDARD_DISCLAIMER,
  );
  return lines.join("\n");
}

function AmountField({
  label,
  mode,
  text,
  allowAuto,
  onMode,
  onText,
}: {
  label: string;
  mode: SourceMode;
  text: string;
  allowAuto: boolean;
  onMode: (m: SourceMode) => void;
  onText: (t: string) => void;
}) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
      <Select
        aria-label={`${label} 방식`}
        value={mode}
        onChange={(e) => onMode(e.target.value as SourceMode)}
      >
        {allowAuto ? <option value="auto">자동</option> : null}
        <option value="manual">직접</option>
        <option value="none">없음</option>
      </Select>
      <Input
        aria-label={label}
        disabled={mode !== "manual"}
        inputMode="numeric"
        placeholder={mode === "auto" ? "자동 계산" : "원"}
        value={text}
        onChange={(e) => onText(formatWonInput(e.target.value))}
      />
    </div>
  );
}

function PartyFields({
  title,
  prefix,
  draft,
  onChange,
}: {
  title: string;
  prefix: string;
  draft: PartyDraft;
  onChange: (next: PartyDraft) => void;
}) {
  const set = (patch: Partial<PartyDraft>) => onChange({ ...draft, ...patch });
  return (
    <div className="grid gap-2 text-xs">
      <span className="text-sm font-medium">{title}</span>
      인지액
      <AmountField
        label={`${prefix} 인지액`}
        mode={draft.stampMode}
        text={draft.stampText}
        allowAuto
        onMode={(stampMode) => set({ stampMode })}
        onText={(stampText) => set({ stampText })}
      />
      송달료
      <AmountField
        label={`${prefix} 송달료`}
        mode={draft.deliveryMode}
        text={draft.deliveryText}
        allowAuto
        onMode={(deliveryMode) => set({ deliveryMode })}
        onText={(deliveryText) => set({ deliveryText })}
      />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={draft.lawyer}
          onChange={(e) => set({ lawyer: e.target.checked })}
        />
        변호사 선임
      </label>
      <Input
        aria-label={`${prefix} 지급보수액`}
        disabled={!draft.lawyer}
        inputMode="numeric"
        placeholder="지급보수액 (비우면 산정액)"
        value={draft.paidText}
        onChange={(e) => set({ paidText: formatWonInput(e.target.value) })}
      />
      <Input
        aria-label={`${prefix} 기타 비용`}
        inputMode="numeric"
        placeholder="기타 실비 (원)"
        value={draft.otherText}
        onChange={(e) => set({ otherText: formatWonInput(e.target.value) })}
      />
    </div>
  );
}

export function CostAssessmentPanel() {
  const [instances, setInstances] = useState<InstanceDraft[]>(() => [
    newInstance(1, "firstInstance"),
  ]);
  const [nextId, setNextId] = useState(2);
  const [burdenPlaintiffText, setBurdenPlaintiffText] = useState("0");
  const [burdenDefendantText, setBurdenDefendantText] = useState("1");
  const [applicant, setApplicant] = useState<CostAssessmentParty>("plaintiff");
  const [opponentSubmitted, setOpponentSubmitted] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const update = (id: number, patch: Partial<InstanceDraft>) =>
    setInstances((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const computed = useMemo((): { result: CostAssessmentResult } | { error: string } => {
    const input = buildCostAssessmentInput({
      instances,
      burdenPlaintiffText,
      burdenDefendantText,
      applicant,
      opponentSubmitted,
    });
    if (typeof input === "string") return { error: input };
    try {
      return { result: computeCostAssessment(input) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [instances, burdenPlaintiffText, burdenDefendantText, applicant, opponentSubmitted]);

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">소송비용확정 (민사소송법 제110조~제112조)</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 pt-0">
        <p className="text-xs text-muted-foreground">
          심급마다 접수일(1심 소 제기일, 상소심 상소 제기일)로 「변호사보수의 소송비용 산입에 관한
          규칙」 판을 고릅니다. 경과규정이 없는 2003·2020판도 같은 기준이며 판은 직접 바꿀 수
          있습니다. 최저액을 먼저 적용한 뒤 1/2로 나누는 순서는 규칙 문언에 따른 것이고 판례로
          확인하지 않았습니다. 이 패널의 입력은 .lcalc 파일에 저장되지 않습니다.
        </p>

        {instances.map((d, i) => {
          const n = `${i + 1}번째 심급`;
          return (
            <fieldset key={d.id} className="grid gap-3 rounded-md border border-border p-3">
              <legend className="flex items-center gap-2 px-1 text-sm font-medium">
                {n}
                {instances.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`${n} 삭제`}
                    onClick={() => setInstances((list) => list.filter((x) => x.id !== d.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
              </legend>
              <div className="grid gap-2 text-xs sm:grid-cols-3">
                <div className="grid gap-1">
                  심급
                  <Select
                    aria-label={`${n} 심급`}
                    value={d.level}
                    onChange={(e) => {
                      const level = e.target.value as AppealsLevel;
                      update(d.id, { level, caseType: LEVEL_CASE_TYPE[level] });
                    }}
                  >
                    <option value="firstInstance">1심</option>
                    <option value="appeal">항소심</option>
                    <option value="supreme">상고심</option>
                  </Select>
                </div>
                {d.level === "firstInstance" ? (
                  <div className="grid gap-1">
                    1심 구분 (합의·단독·소액)
                    <Select
                      aria-label={`${n} 1심 구분`}
                      value={d.caseType}
                      onChange={(e) => update(d.id, { caseType: e.target.value as CaseType })}
                    >
                      <option value="civilFirstInstanceCollegial">합의</option>
                      <option value="civilFirstInstanceSingle">단독</option>
                      <option value="civilSmallClaims">소액</option>
                    </Select>
                  </div>
                ) : null}
                <div className="grid gap-1">
                  접수일
                  <Input
                    aria-label={`${n} 접수일`}
                    type="date"
                    value={d.filingDate}
                    onChange={(e) => update(d.id, { filingDate: e.target.value })}
                  />
                </div>
                <div className="grid gap-1">
                  {d.level === "firstInstance" ? "소가" : "불복 범위 (인지규칙 제25조)"}
                  <Input
                    aria-label={`${n} 소가`}
                    inputMode="numeric"
                    value={d.caseValueText}
                    onChange={(e) =>
                      update(d.id, { caseValueText: formatWonInput(e.target.value) })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  당사자수 (송달료 자동)
                  <Input
                    aria-label={`${n} 당사자수`}
                    inputMode="numeric"
                    value={d.partyCountText}
                    onChange={(e) => update(d.id, { partyCountText: e.target.value })}
                  />
                </div>
                <div className="grid gap-1">
                  규칙 판
                  <Select
                    aria-label={`${n} 규칙 판`}
                    value={d.version}
                    onChange={(e) =>
                      update(d.id, { version: e.target.value as LawyerFeeRuleVersionKey | "" })
                    }
                  >
                    <option value="">접수일 기준 자동</option>
                    {RULE_VERSIONS.map((v) => (
                      <option key={v.key} value={v.key}>
                        {v.key.slice(1)}판 ({v.ruleNumber}, 시행 {v.effectiveFrom})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-1">
                  변호사보수 1/2 사유
                  <Select
                    aria-label={`${n} 1/2 사유`}
                    value={d.halfReason}
                    onChange={(e) =>
                      update(d.id, { halfReason: e.target.value as CostAssessmentHalfReason })
                    }
                  >
                    {HALF_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["plaintiff", "defendant"] as const).map((p) => (
                  <PartyFields
                    key={p}
                    title={PARTY_LABEL[p]}
                    prefix={`${n} ${PARTY_LABEL[p]}`}
                    draft={d[p]}
                    onChange={(next) => update(d.id, { [p]: next })}
                  />
                ))}
              </div>
            </fieldset>
          );
        })}

        <div className="flex flex-wrap gap-2">
          {(["appeal", "supreme"] as const).map((level) => (
            <Button
              key={level}
              type="button"
              variant="outline"
              onClick={() => {
                setInstances((list) => [...list, newInstance(nextId, level)]);
                setNextId((id) => id + 1);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {LEVEL_LABEL[level]} 추가
            </Button>
          ))}
        </div>

        <div className="grid gap-2 text-xs sm:grid-cols-4">
          <div className="grid gap-1">
            원고 부담 비율
            <Input
              aria-label="원고 부담 비율"
              inputMode="numeric"
              value={burdenPlaintiffText}
              onChange={(e) => setBurdenPlaintiffText(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            피고 부담 비율
            <Input
              aria-label="피고 부담 비율"
              inputMode="numeric"
              value={burdenDefendantText}
              onChange={(e) => setBurdenDefendantText(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            확정 신청인
            <Select
              aria-label="확정 신청인"
              value={applicant}
              onChange={(e) => setApplicant(e.target.value as CostAssessmentParty)}
            >
              <option value="plaintiff">원고</option>
              <option value="defendant">피고</option>
            </Select>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={opponentSubmitted}
              onChange={(e) => setOpponentSubmitted(e.target.checked)}
            />
            상대방 비용계산서 제출 (상계, 제112조)
          </label>
        </div>

        {"error" in computed ? (
          <p className="text-sm text-muted-foreground" role="status">
            {computed.error}
          </p>
        ) : (
          <CostAssessmentResultView
            result={computed.result}
            copyMessage={copyMessage}
            onCopy={async () => {
              try {
                await ipc.copyToClipboard(formatCostAssessmentForClipboard(computed.result));
                setCopyMessage("클립보드에 복사했습니다.");
              } catch (e) {
                setCopyMessage(`복사 실패: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function CostAssessmentResultView({
  result,
  copyMessage,
  onCopy,
}: {
  result: CostAssessmentResult;
  copyMessage: string | null;
  onCopy: () => Promise<void>;
}) {
  return (
    <div className="grid gap-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-1">심급</th>
            <th className="py-1">적용 판</th>
            <th className="py-1 text-right">변호사보수 산정액</th>
            <th className="py-1 text-right">원고 소계</th>
            <th className="py-1 text-right">피고 소계</th>
          </tr>
        </thead>
        <tbody>
          {result.instances.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-b-0">
              <td className="py-1">{LEVEL_LABEL[r.level]}</td>
              <td className="py-1">{r.lawyerFee.ruleNumber}</td>
              <td className="py-1 text-right">{formatWon(r.lawyerFee.assessedWon)}</td>
              <td className="py-1 text-right">{formatWon(r.plaintiff.subtotalWon)}</td>
              <td className="py-1 text-right">{formatWon(r.defendant.subtotalWon)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="rounded-md border border-border bg-muted/40 p-3 text-xs">
        <summary className="cursor-pointer text-sm font-medium">산식과 근거</summary>
        <div className="grid gap-2 pt-2">
          {result.instances.map((r, i) => (
            <div key={i} className="grid gap-1">
              <strong>
                {i + 1}. {LEVEL_LABEL[r.level]}
              </strong>
              <span>{r.lawyerFee.formulaText}</span>
              {(["plaintiff", "defendant"] as const).map((p) => (
                <span key={p}>
                  {PARTY_LABEL[p]}: 인지 {r[p].stampDutyFormula} / 송달료 {r[p].deliveryFeeFormula}{" "}
                  / 변호사보수 {r[p].lawyerFeeFormula}
                </span>
              ))}
            </div>
          ))}
        </div>
      </details>
      <div className="grid gap-1 text-sm">
        <p>
          비용 합계: 원고 {formatWon(result.totals.plaintiff)} · 피고{" "}
          {formatWon(result.totals.defendant)}
        </p>
        <p className="text-xs text-muted-foreground">
          신청인 청구: {result.applicantClaim.formulaText}
        </p>
        {result.opponentClaim ? (
          <p className="text-xs text-muted-foreground">
            상대방 청구: {result.opponentClaim.formulaText}
          </p>
        ) : null}
        <p className="font-semibold" data-testid="cost-assessment-net">
          {PARTY_LABEL[result.net.payer]}가 {PARTY_LABEL[result.net.payee]}에게{" "}
          {formatWon(result.net.amountWon)}
        </p>
        <p className="text-xs text-muted-foreground">{result.net.formulaText}</p>
      </div>
      {result.warnings.map((w) => (
        <p
          key={w}
          className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        >
          {w}
        </p>
      ))}
      <p className="text-xs text-muted-foreground">{result.disclaimer}</p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => void onCopy()}>
          <Clipboard className="h-4 w-4" aria-hidden="true" />
          소송비용확정 복사
        </Button>
        {copyMessage ? <span className="text-xs">{copyMessage}</span> : null}
      </div>
    </div>
  );
}
